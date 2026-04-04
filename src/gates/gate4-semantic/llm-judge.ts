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
}

export interface JudgeVerdict {
  score: number;       // 1-5
  reasoning: string;
  verdict: "pass" | "warn" | "fail";
  raw?: string;
}

const DEFAULT_CONFIG: LLMJudgeConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0,
  maxTokens: 1024,
};

/**
 * LLMJudge — sends structured evaluation prompts to an LLM and parses scored verdicts.
 *
 * Supports two providers:
 * - Anthropic (Claude) via @anthropic-ai/sdk
 * - OpenAI-compatible (GPT, Groq, Ollama, local) via openai SDK
 *
 * All evaluation prompts follow the same format:
 *   SCORE: 1-5
 *   REASONING: <paragraph>
 *   VERDICT: pass|warn|fail
 */
export class LLMJudge {
  private config: LLMJudgeConfig;
  private anthropic?: Anthropic;
  private openai?: OpenAI;

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
      };
    }
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const response = await this.anthropic!.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens!,
      temperature: this.config.temperature!,
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
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0]?.message?.content ?? "";
  }

  private parseVerdict(text: string): JudgeVerdict {
    const scoreMatch = text.match(/SCORE:\s*(\d)/);
    const reasoningMatch = text.match(/REASONING:\s*(.+?)(?=\nVERDICT:|$)/s);
    const verdictMatch = text.match(/VERDICT:\s*(pass|warn|fail)/i);

    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : text.substring(0, 500);
    const verdictStr = verdictMatch ? verdictMatch[1].toLowerCase() : null;

    let verdict: "pass" | "warn" | "fail";
    if (verdictStr === "pass" || verdictStr === "warn" || verdictStr === "fail") {
      verdict = verdictStr;
    } else {
      verdict = score >= 4 ? "pass" : score >= 3 ? "warn" : "fail";
    }

    return { score, reasoning, verdict, raw: text };
  }
}
