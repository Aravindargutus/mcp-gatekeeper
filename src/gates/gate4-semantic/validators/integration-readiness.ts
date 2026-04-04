import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import type { TranscriptRecorder } from "../transcript.js";
import { integrationReadinessPrompt } from "../prompts.js";
import { logger } from "../../../utils/logger.js";

export class IntegrationReadinessValidator implements IValidator {
  readonly name = "integration-readiness";
  readonly description = "Uses LLM to evaluate if a developer could integrate from metadata alone";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.invocationResults.size === 0 && ctx.toolDefinitions.length === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No tools to evaluate", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const scores: number[] = [];
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const trials = ctx.trials ?? 1;
    const recorder = ctx.transcriptRecorder as TranscriptRecorder | undefined;
    const judge = new LLMJudge(llmConfig);
    let passCount = 0;

    for (const tool of ctx.toolDefinitions) {
      const invocationResult = ctx.invocationResults.get(tool.name);
      const outputSample = invocationResult?.content
        ?.filter((c) => c.type === "text").map((c) => c.text).join("\n") ?? "No sample output available";

      const prompt = integrationReadinessPrompt(
        tool.name, tool.description ?? "No description",
        JSON.stringify(tool.inputSchema, null, 2),
        outputSample.substring(0, 1000)
      );

      try {
        const startMs = Date.now();
        const result = await judge.evaluateWithTrials(prompt, trials);
        recorder?.recordTrials(tool.name, this.name, prompt, result, Date.now() - startMs);

        scores.push(result.medianScore);
        if (result.consensusVerdict === "pass") passCount++;

        if (result.medianScore < 3) {
          evidence.push(`Tool "${tool.name}": readiness ${result.medianScore}/5`);
          for (const fix of result.fixes.slice(0, 2)) evidence.push(`  FIX: ${fix}`);
        }
      } catch (err) {
        logger.error(`Integration readiness eval failed for "${tool.name}": ${err instanceof Error ? err.message : String(err)}`);
        evidence.push(`Tool "${tool.name}": evaluation failed`);
      }
    }

    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return {
      validatorName: this.name,
      severity: scores.some((s) => s < 3) ? Severity.WARN : Severity.PASS,
      message: `Average integration readiness: ${avgScore.toFixed(1)}/5 across ${scores.length} tools`,
      details: { avgScore, toolsEvaluated: scores.length },
      durationMs: 0, evidence,
      partialCredit: scores.length > 0 ? passCount / scores.length : 0,
    };
  }
}
