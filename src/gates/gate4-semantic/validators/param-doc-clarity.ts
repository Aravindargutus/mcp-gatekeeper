import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import { paramDocClarityPrompt } from "../prompts.js";

export class ParamDocClarityValidator implements IValidator {
  readonly name = "param-doc-clarity";
  readonly description = "Uses LLM to rate parameter documentation clarity";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    const scores: number[] = [];
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const threshold = 3;
    const judge = new LLMJudge(llmConfig);

    for (const tool of ctx.toolDefinitions) {
      const prompt = paramDocClarityPrompt(
        tool.name,
        tool.description ?? "No description",
        JSON.stringify(tool.inputSchema, null, 2)
      );

      const verdict = await judge.evaluate(prompt);
      scores.push(verdict.score);

      if (verdict.score < threshold) {
        evidence.push(`Tool "${tool.name}": clarity score ${verdict.score}/5 — ${verdict.reasoning.substring(0, 200)}`);
      }
    }

    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return {
      validatorName: this.name,
      severity: scores.some((s) => s < threshold) ? Severity.WARN : Severity.PASS,
      message: `Average param clarity: ${avgScore.toFixed(1)}/5 across ${scores.length} tools`,
      details: { avgScore, toolsEvaluated: scores.length },
      durationMs: 0,
      evidence,
    };
  }
}
