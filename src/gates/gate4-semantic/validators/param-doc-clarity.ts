import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import type { TranscriptRecorder } from "../transcript.js";
import { paramDocClarityPrompt } from "../prompts.js";
import { logger } from "../../../utils/logger.js";

export class ParamDocClarityValidator implements IValidator {
  readonly name = "param-doc-clarity";
  readonly description = "Uses LLM to rate parameter documentation clarity";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    const scores: number[] = [];
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const trials = ctx.trials ?? 1;
    const recorder = ctx.transcriptRecorder as TranscriptRecorder | undefined;
    const judge = new LLMJudge(llmConfig);
    let passCount = 0;

    for (const tool of ctx.toolDefinitions) {
      const prompt = paramDocClarityPrompt(
        tool.name, tool.description ?? "No description",
        JSON.stringify(tool.inputSchema, null, 2)
      );

      try {
        const startMs = Date.now();
        const result = await judge.evaluateWithTrials(prompt, trials);
        recorder?.recordTrials(tool.name, this.name, prompt, result, Date.now() - startMs);

        scores.push(result.medianScore);
        if (result.consensusVerdict === "pass") passCount++;

        if (result.medianScore < 3) {
          evidence.push(`Tool "${tool.name}": clarity ${result.medianScore}/5`);
          for (const fix of result.fixes.slice(0, 2)) evidence.push(`  FIX: ${fix}`);
        }
      } catch (err) {
        logger.error(`Param clarity eval failed for "${tool.name}": ${err instanceof Error ? err.message : String(err)}`);
        evidence.push(`Tool "${tool.name}": evaluation failed`);
      }
    }

    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return {
      validatorName: this.name,
      severity: scores.some((s) => s < 3) ? Severity.WARN : Severity.PASS,
      message: `Average param clarity: ${avgScore.toFixed(1)}/5 across ${scores.length} tools`,
      details: { avgScore, toolsEvaluated: scores.length },
      durationMs: 0, evidence,
      partialCredit: scores.length > 0 ? passCount / scores.length : 0,
    };
  }
}
