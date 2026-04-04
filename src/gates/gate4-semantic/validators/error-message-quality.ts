import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import type { TranscriptRecorder } from "../transcript.js";
import { errorMessageQualityPrompt } from "../prompts.js";
import { logger } from "../../../utils/logger.js";

export class ErrorMessageQualityValidator implements IValidator {
  readonly name = "error-message-quality";
  readonly description = "Uses LLM to evaluate whether error messages are actionable";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const trials = ctx.trials ?? 1;
    const recorder = ctx.transcriptRecorder as TranscriptRecorder | undefined;
    const judge = new LLMJudge(llmConfig);
    const evidence: string[] = [];
    const scores: number[] = [];
    let passCount = 0;

    // Group error responses by tool
    const errorsByTool = new Map<string, string[]>();
    for (const [key, response] of ctx.errorResponses.entries()) {
      const [toolName] = key.split(":");
      const resp = response as Record<string, unknown>;
      const content = (resp.content as Array<Record<string, unknown>>) ?? [];
      const text = content.filter((c) => c.type === "text").map((c) => c.text as string).join("; ");
      if (text) {
        const list = errorsByTool.get(toolName) ?? [];
        list.push(text);
        errorsByTool.set(toolName, list);
      }
    }

    if (errorsByTool.size === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No error responses available to evaluate", details: {}, durationMs: 0, evidence: [] };
    }

    for (const [toolName, errors] of errorsByTool) {
      const prompt = errorMessageQualityPrompt(toolName, errors.join("\n---\n"));

      try {
        const startMs = Date.now();
        const result = await judge.evaluateWithTrials(prompt, trials);
        recorder?.recordTrials(toolName, this.name, prompt, result, Date.now() - startMs);

        scores.push(result.medianScore);
        if (result.consensusVerdict === "pass") passCount++;

        if (result.medianScore < 3) {
          evidence.push(`Tool "${toolName}": error quality ${result.medianScore}/5`);
          for (const fix of result.fixes.slice(0, 2)) evidence.push(`  FIX: ${fix}`);
        }
      } catch (err) {
        logger.error(`Error message eval failed for "${toolName}": ${err instanceof Error ? err.message : String(err)}`);
        evidence.push(`Tool "${toolName}": evaluation failed`);
      }
    }

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    return {
      validatorName: this.name,
      severity: scores.some((s) => s < 3) ? Severity.WARN : Severity.PASS,
      message: `Average error message quality: ${avgScore.toFixed(1)}/5 across ${scores.length} tools`,
      details: { avgScore, toolsEvaluated: scores.length },
      durationMs: 0, evidence,
      partialCredit: scores.length > 0 ? passCount / scores.length : 0,
    };
  }
}
