import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig, type TrialResult } from "../llm-judge.js";
import type { TranscriptRecorder } from "../transcript.js";
import { descriptionAccuracyPrompt } from "../prompts.js";
import { logger } from "../../../utils/logger.js";

export class DescriptionAccuracyValidator implements IValidator {
  readonly name = "description-accuracy";
  readonly description = "Uses LLM to compare tool descriptions against actual invocation behavior";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.invocationResults.size === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No invocation results — run Gate 3 first", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const scores: number[] = [];
    const perToolFixes: Array<{ tool: string; fixes: string[] }> = [];
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const threshold = ((ctx.config.gates[4]?.validators?.["description-accuracy"] ?? {}) as Record<string, unknown>).threshold as number ?? 3;
    const trials = ctx.trials ?? 1;
    const recorder = ctx.transcriptRecorder as TranscriptRecorder | undefined;
    const judge = new LLMJudge(llmConfig);

    // Cross-gate context from Gate 1
    const gate1 = ctx.gateResults.find((g) => g.gateNumber === 1);
    const descQuality = gate1?.validatorResults.find((v) => v.validatorName === "description-quality");
    const gate1Context = descQuality && descQuality.evidence.length > 0
      ? descQuality.evidence.slice(0, 5).join("\n") : undefined;

    let passCount = 0;
    let toolsEvaluated = 0;

    for (const tool of ctx.toolDefinitions) {
      if (!tool.description) continue;
      const invocationResult = ctx.invocationResults.get(tool.name);
      if (!invocationResult) continue;

      const resultText = invocationResult.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n") ?? "No result";

      const prompt = descriptionAccuracyPrompt(
        tool.name, tool.description,
        JSON.stringify(tool.inputSchema, null, 2),
        resultText.substring(0, 2000),
        gate1Context
      );

      // Per-tool try-catch — one failure doesn't crash the entire validator
      try {
        const startMs = Date.now();
        const trialResult = await judge.evaluateWithTrials(prompt, trials);
        const durationMs = Date.now() - startMs;

        // Record transcript for debugging
        recorder?.recordTrials(tool.name, this.name, prompt, trialResult, durationMs);

        scores.push(trialResult.medianScore);
        toolsEvaluated++;

        if (trialResult.consensusVerdict === "pass") passCount++;

        if (trialResult.medianScore < threshold) {
          evidence.push(`Tool "${tool.name}": score ${trialResult.medianScore}/5 (${trials > 1 ? `${trials} trials, variance ${trialResult.variance.toFixed(2)}` : "1 trial"})`);
          for (const fix of trialResult.fixes.slice(0, 3)) {
            evidence.push(`  FIX: ${fix}`);
          }
        }

        if (trialResult.fixes.length > 0) {
          perToolFixes.push({ tool: tool.name, fixes: trialResult.fixes });
        }

        logger.debug(`  ${tool.name}: ${trialResult.medianScore}/5 (${trialResult.consensusVerdict})`);
      } catch (err) {
        logger.error(`LLM eval failed for "${tool.name}": ${err instanceof Error ? err.message : String(err)}`);
        evidence.push(`Tool "${tool.name}": LLM evaluation failed — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const failCount = scores.filter((s) => s < threshold).length;
    const partialCredit = toolsEvaluated > 0 ? passCount / toolsEvaluated : 0;

    return {
      validatorName: this.name,
      severity: failCount > 0 ? Severity.FAIL : avgScore >= 4 ? Severity.PASS : Severity.WARN,
      message: `Average description accuracy: ${avgScore.toFixed(1)}/5 across ${toolsEvaluated} tools (${failCount} below threshold)`,
      details: { avgScore, toolsEvaluated, failCount, threshold, perToolFixes },
      durationMs: 0,
      evidence,
      partialCredit,
      trialMetrics: trials > 1 ? {
        passAtK: scores.filter((s) => s >= threshold).length > 0 ? 1 : 0,
        passAllK: scores.every((s) => s >= threshold) ? 1 : 0,
        medianScore: avgScore,
        variance: scores.length > 1
          ? scores.reduce((sum, s) => sum + (s - avgScore) ** 2, 0) / scores.length
          : 0,
        trialCount: trials,
      } : undefined,
    };
  }
}
