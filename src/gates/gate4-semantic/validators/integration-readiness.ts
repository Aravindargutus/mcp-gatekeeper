import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import { integrationReadinessPrompt } from "../prompts.js";

export class IntegrationReadinessValidator implements IValidator {
  readonly name = "integration-readiness";
  readonly description = "Uses LLM to evaluate if a developer could integrate from metadata alone";
  readonly dependencies = ["tool-invocation"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    const scores: number[] = [];
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const judge = new LLMJudge(llmConfig);

    for (const tool of ctx.toolDefinitions) {
      const invocationResult = ctx.invocationResults.get(tool.name);
      const outputSample = invocationResult?.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n") ?? "No sample output available";

      const prompt = integrationReadinessPrompt(
        tool.name,
        tool.description ?? "No description",
        JSON.stringify(tool.inputSchema, null, 2),
        outputSample.substring(0, 1000)
      );

      const verdict = await judge.evaluate(prompt);
      scores.push(verdict.score);

      if (verdict.score < 3) {
        evidence.push(`Tool "${tool.name}": readiness ${verdict.score}/5 — ${verdict.reasoning.substring(0, 200)}`);
      }
    }

    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return {
      validatorName: this.name,
      severity: scores.some((s) => s < 3) ? Severity.WARN : Severity.PASS,
      message: `Average integration readiness: ${avgScore.toFixed(1)}/5 across ${scores.length} tools`,
      details: { avgScore, toolsEvaluated: scores.length },
      durationMs: 0,
      evidence,
    };
  }
}
