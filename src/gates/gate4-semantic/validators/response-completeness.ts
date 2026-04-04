import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import { responseCompletenessPrompt } from "../prompts.js";

export class ResponseCompletenessValidator implements IValidator {
  readonly name = "response-completeness";
  readonly description = "Uses LLM to evaluate if responses contain all promised data";
  // Reads ctx.invocationResults populated by Gate 3

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.invocationResults.size === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No invocation results — run Gate 3 first", details: {}, durationMs: 0, evidence: [] };
    }
    const evidence: string[] = [];
    const scores: number[] = [];
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const judge = new LLMJudge(llmConfig);

    for (const tool of ctx.toolDefinitions) {
      const invocationResult = ctx.invocationResults.get(tool.name);
      if (!invocationResult) continue;

      const resultText = invocationResult.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n") ?? "No result";

      const prompt = responseCompletenessPrompt(
        tool.name,
        tool.description ?? "No description",
        resultText.substring(0, 2000)
      );

      const verdict = await judge.evaluate(prompt);
      scores.push(verdict.score);

      if (verdict.score < 3) {
        evidence.push(`Tool "${tool.name}": completeness ${verdict.score}/5 — ${verdict.reasoning.substring(0, 200)}`);
      }
    }

    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return {
      validatorName: this.name,
      severity: scores.some((s) => s < 3) ? Severity.WARN : Severity.PASS,
      message: `Average response completeness: ${avgScore.toFixed(1)}/5 across ${scores.length} tools`,
      details: { avgScore, toolsEvaluated: scores.length },
      durationMs: 0,
      evidence,
    };
  }
}
