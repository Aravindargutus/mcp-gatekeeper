import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import { errorMessageQualityPrompt } from "../prompts.js";

export class ErrorMessageQualityValidator implements IValidator {
  readonly name = "error-message-quality";
  readonly description = "Uses LLM to evaluate whether error messages are actionable";
  readonly dependencies = ["boundary-testing"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    const scores: number[] = [];
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const judge = new LLMJudge(llmConfig);

    // Group error responses by tool
    const errorsByTool = new Map<string, string[]>();
    for (const [key, response] of ctx.errorResponses.entries()) {
      const [toolName] = key.split(":");
      const resp = response as Record<string, unknown>;
      const content = (resp.content as Array<Record<string, unknown>>) ?? [];
      const text = content
        .filter((c) => c.type === "text")
        .map((c) => c.text as string)
        .join("; ");
      if (text) {
        const list = errorsByTool.get(toolName) ?? [];
        list.push(text);
        errorsByTool.set(toolName, list);
      }
    }

    for (const [toolName, errors] of errorsByTool) {
      const prompt = errorMessageQualityPrompt(toolName, errors.join("\n---\n"));
      const verdict = await judge.evaluate(prompt);
      scores.push(verdict.score);

      if (verdict.score < 3) {
        evidence.push(`Tool "${toolName}": error quality ${verdict.score}/5 — ${verdict.reasoning.substring(0, 200)}`);
      }
    }

    if (scores.length === 0) {
      return {
        validatorName: this.name,
        severity: Severity.SKIP,
        message: "No error responses available to evaluate",
        details: {},
        durationMs: 0,
        evidence: [],
      };
    }

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
      validatorName: this.name,
      severity: scores.some((s) => s < 3) ? Severity.WARN : Severity.PASS,
      message: `Average error message quality: ${avgScore.toFixed(1)}/5 across ${scores.length} tools`,
      details: { avgScore, toolsEvaluated: scores.length },
      durationMs: 0,
      evidence,
    };
  }
}
