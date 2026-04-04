import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { logger } from "../../utils/logger.js";

export interface LLMJudgeConfig {
  provider: "anthropic" | "openai";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  /** Number of trials per evaluation for pass@k/pass^k (default: 1) */
  trials?: number;
}

export interface JudgeVerdict {
  score: number;
  reasoning: string;
  verdict: "pass" | "warn" | "fail";
  fixes: string[];
  raw?: string;
}

/** Multi-trial result with pass@k and pass^k metrics */
export interface TrialResult {
  /** All individual trial verdicts */
  trials: JudgeVerdict[];
  /** Median score across trials (robust to outliers) */
  medianScore: number;
  /** pass@k: probability of at least one success in k trials */
  passAtK: number;
  /** pass^k: probability ALL trials succeed (reliability metric) */
  passAllK: number;
  /** Consensus verdict from majority of trials */
  consensusVerdict: "pass" | "warn" | "fail";
  /** Merged fix list (deduplicated) from all trials */
  fixes: string[];
  /** Score variance — high variance means evaluator or tool is flaky */
  variance: number;
}

const DEFAULT_CONFIG: LLMJudgeConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0,
  maxTokens: 1500,
};

/**
 * LLMJudge — the evaluator half of our GAN-inspired architecture.
 *
 * Applies three principles from Anthropic's harness design article:
 * 1. SKEPTICAL by default — system prompt pushes against self-rationalization
 * 2. ACTIONABLE — every verdict includes specific fix recommendations
 * 3. EVIDENCE-BASED — compares claimed behavior against actual results
 */
export class LLMJudge {
  private config: LLMJudgeConfig;
  private anthropic?: Anthropic;
  private openai?: OpenAI;

  /** System prompt that makes the evaluator skeptical, not praising. */
  private static readonly SYSTEM_PROMPT = `You are a strict QA evaluator for MCP (Model Context Protocol) tools. Your job is to find problems, not praise.

EVALUATION RULES:
- Be skeptical. If something seems "fine", look harder for issues.
- Never rationalize away a problem. If the description says X but the tool does Y, that's a FAIL — no exceptions.
- Missing information is a defect, not "room for improvement."
- Vague descriptions are WARNs. Misleading descriptions are FAILs.
- Every score below 5 MUST include specific fixes the developer should make.
- You are protecting end users who will rely on this tool's metadata. Be their advocate.`;

  constructor(config?: Partial<LLMJudgeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.provider === "anthropic") {
      this.anthropic = new Anthropic({
        apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
      });
    } else {
      this.openai = new OpenAI({
        apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
        baseURL: this.config.baseUrl,
      });
    }
  }

  /** Single evaluation (backward compatible) */
  async evaluate(prompt: string): Promise<JudgeVerdict> {
    logger.debug(`LLM Judge evaluating (${this.config.provider}/${this.config.model})`);
    const startTime = Date.now();

    try {
      const responseText = this.config.provider === "anthropic"
        ? await this.callAnthropic(prompt)
        : await this.callOpenAI(prompt);

      logger.debug(`LLM response in ${Date.now() - startTime}ms`);
      return this.parseVerdict(responseText);
    } catch (err) {
      logger.error(`LLM Judge error: ${err instanceof Error ? err.message : String(err)}`);
      return {
        score: 0,
        reasoning: `LLM evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
        verdict: "fail",
        fixes: [],
      };
    }
  }

  /**
   * Multi-trial evaluation with pass@k and pass^k metrics.
   * Runs the same prompt k times and aggregates results.
   *
   * From Anthropic's eval framework:
   * - pass@k measures "can this tool pass at all?" (at least one success)
   * - pass^k measures "is this tool reliably good?" (all trials succeed)
   * - High variance between trials indicates flaky tool or evaluator
   */
  async evaluateWithTrials(prompt: string, k?: number): Promise<TrialResult> {
    const trials = k ?? this.config.trials ?? 1;

    if (trials <= 1) {
      const verdict = await this.evaluate(prompt);
      return {
        trials: [verdict],
        medianScore: verdict.score,
        passAtK: verdict.verdict === "pass" ? 1 : 0,
        passAllK: verdict.verdict === "pass" ? 1 : 0,
        consensusVerdict: verdict.verdict,
        fixes: verdict.fixes,
        variance: 0,
      };
    }

    logger.debug(`Running ${trials} trials in parallel for pass@k evaluation`);

    // Run all trials in parallel (they're independent)
    const results = await Promise.all(
      Array.from({ length: trials }, () => this.evaluate(prompt))
    );

    return this.aggregateTrials(results);
  }

  private aggregateTrials(trials: JudgeVerdict[]): TrialResult {
    const scores = trials.map((t) => t.score).sort((a, b) => a - b);
    const medianScore = scores[Math.floor(scores.length / 2)];

    // pass@k: at least one trial has verdict "pass"
    const passCount = trials.filter((t) => t.verdict === "pass").length;
    const passAtK = passCount > 0 ? 1 : 0;

    // pass^k: ALL trials have verdict "pass"
    const passAllK = passCount === trials.length ? 1 : 0;

    // Consensus: majority verdict
    const verdictCounts = { pass: 0, warn: 0, fail: 0 };
    for (const t of trials) verdictCounts[t.verdict]++;
    const consensusVerdict =
      verdictCounts.fail > trials.length / 2 ? "fail" as const
        : verdictCounts.pass > trials.length / 2 ? "pass" as const
          : "warn" as const;

    // Variance (how much scores disagree)
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;

    // Deduplicate fixes across trials
    const fixSet = new Set<string>();
    for (const t of trials) {
      for (const fix of t.fixes) fixSet.add(fix);
    }

    return {
      trials,
      medianScore,
      passAtK,
      passAllK,
      consensusVerdict,
      fixes: [...fixSet],
      variance,
    };
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const response = await this.anthropic!.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens!,
      temperature: this.config.temperature!,
      system: LLMJudge.SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type === "text") return block.text;
    return "";
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await this.openai!.chat.completions.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens!,
      temperature: this.config.temperature!,
      messages: [
        { role: "system", content: LLMJudge.SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    return response.choices[0]?.message?.content ?? "";
  }

  private parseVerdict(text: string): JudgeVerdict {
    if (!text || text.trim().length === 0) {
      logger.warn("LLM returned empty response — scoring as 0");
      return { score: 0, reasoning: "LLM returned empty response", verdict: "fail", fixes: [] };
    }

    const scoreMatch = text.match(/SCORE:\s*(\d)/);
    const reasoningMatch = text.match(/REASONING:\s*(.+?)(?=\n(?:FIXES|VERDICT):|$)/s);
    const verdictMatch = text.match(/VERDICT:\s*(pass|warn|fail)/i);
    const fixesMatch = text.match(/FIXES:\s*(.+?)(?=\nVERDICT:|$)/s);

    if (!scoreMatch) {
      logger.warn(`LLM response missing SCORE field — could not parse structured output. First 100 chars: "${text.substring(0, 100)}"`);
    }

    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : text.substring(0, 500);
    const verdictStr = verdictMatch ? verdictMatch[1].toLowerCase() : null;

    // Parse fixes list
    const fixes: string[] = [];
    if (fixesMatch) {
      const fixLines = fixesMatch[1].trim().split("\n");
      for (const line of fixLines) {
        const cleaned = line.replace(/^[-•*\d.)\s]+/, "").trim();
        if (cleaned.length > 0) fixes.push(cleaned);
      }
    }

    let verdict: "pass" | "warn" | "fail";
    if (verdictStr === "pass" || verdictStr === "warn" || verdictStr === "fail") {
      verdict = verdictStr;
    } else {
      verdict = score >= 4 ? "pass" : score >= 3 ? "warn" : "fail";
    }

    return { score, reasoning, verdict, fixes, raw: text };
  }
}
