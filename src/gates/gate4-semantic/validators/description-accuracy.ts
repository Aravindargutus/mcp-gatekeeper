import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import { descriptionAccuracyPrompt } from "../prompts.js";

export class DescriptionAccuracyValidator implements IValidator {
  readonly name = "description-accuracy";
  readonly description = "Uses LLM to compare tool descriptions against actual invocation behavior";
  readonly dependencies = ["tool-invocation"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    const scores: number[] = [];
    const gateConfig = ctx.config.gates[4]?.validators?.["description-accuracy"] ?? {};
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const threshold = (gateConfig as Record<string, unknown>).threshold as number ?? 3;
    const judge = new LLMJudge(llmConfig);

    for (const tool of ctx.toolDefinitions) {
      if (!tool.description) continue;
      const invocationResult = ctx.invocationResults.get(tool.name);
      if (!invocationResult) continue;

      const resultText = invocationResult.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n") ?? "No result";

      const prompt = descriptionAccuracyPrompt(
        tool.name,
        tool.description,
        JSON.stringify(tool.inputSchema, null, 2),
        resultText.substring(0, 2000)
      );

      const verdict = await judge.evaluate(prompt);
      scores.push(verdict.score);

      if (verdict.score < threshold) {
        evidence.push(
          `Tool "${tool.name}": score ${verdict.score}/5 — ${verdict.reasoning.substring(0, 200)}`
        );
      }
    }

    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const failCount = scores.filter((s) => s < threshold).length;

    return {
      validatorName: this.name,
      severity: failCount > 0 ? Severity.FAIL : avgScore >= 4 ? Severity.PASS : Severity.WARN,
      message: `Average description accuracy: ${avgScore.toFixed(1)}/5 across ${scores.length} tools (threshold: ${threshold})`,
      details: { avgScore, toolsEvaluated: scores.length, failCount, threshold },
      durationMs: 0,
      evidence,
    };
  }
}
