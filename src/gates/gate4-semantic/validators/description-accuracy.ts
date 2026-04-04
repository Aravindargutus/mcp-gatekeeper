import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import { descriptionAccuracyPrompt } from "../prompts.js";

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
    const gateConfig = ctx.config.gates[4]?.validators?.["description-accuracy"] ?? {};
    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const threshold = (gateConfig as Record<string, unknown>).threshold as number ?? 3;
    const judge = new LLMJudge(llmConfig);

    // Pull Gate 1 description-quality findings for cross-gate context
    const gate1 = ctx.gateResults.find((g) => g.gateNumber === 1);
    const descQuality = gate1?.validatorResults.find((v) => v.validatorName === "description-quality");
    const gate1Context = descQuality && descQuality.evidence.length > 0
      ? descQuality.evidence.slice(0, 5).join("\n")
      : undefined;

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
        resultText.substring(0, 2000),
        gate1Context
      );

      const verdict = await judge.evaluate(prompt);
      scores.push(verdict.score);

      if (verdict.fixes.length > 0) {
        perToolFixes.push({ tool: tool.name, fixes: verdict.fixes });
      }

      if (verdict.score < threshold) {
        evidence.push(`Tool "${tool.name}": score ${verdict.score}/5 — ${verdict.reasoning.substring(0, 200)}`);
        for (const fix of verdict.fixes.slice(0, 3)) {
          evidence.push(`  FIX: ${fix}`);
        }
      }
    }

    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const failCount = scores.filter((s) => s < threshold).length;

    return {
      validatorName: this.name,
      severity: failCount > 0 ? Severity.FAIL : avgScore >= 4 ? Severity.PASS : Severity.WARN,
      message: `Average description accuracy: ${avgScore.toFixed(1)}/5 across ${scores.length} tools (${failCount} below threshold)`,
      details: { avgScore, toolsEvaluated: scores.length, failCount, threshold, perToolFixes },
      durationMs: 0,
      evidence,
    };
  }
}
