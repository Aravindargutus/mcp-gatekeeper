import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import { holisticSummaryPrompt } from "../prompts.js";

/**
 * HolisticSummaryValidator — the "planner agent" from Anthropic's harness pattern.
 *
 * Runs LAST in Gate 4. Takes ALL findings from Gates 1-4 and produces
 * a single, prioritized improvement plan. This is the most valuable output
 * for MCP server developers — instead of digging through 30+ validator results,
 * they get one actionable document.
 *
 * Cross-references:
 * - Gate 1 schema issues (missing descriptions, invalid types)
 * - Gate 2 security findings (injection risks, missing auth)
 * - Gate 3 functional bugs (boundary failures, timeout issues)
 * - Gate 4 semantic scores (description accuracy, param clarity)
 */
export class HolisticSummaryValidator implements IValidator {
  readonly name = "holistic-summary";
  readonly description = "Cross-references all gates to produce a prioritized improvement plan for the MCP server developer";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    // Need at least Gate 1 results to produce a meaningful summary
    if (ctx.gateResults.length === 0) {
      return {
        validatorName: this.name, severity: Severity.SKIP,
        message: "No gate results available for holistic summary",
        details: {}, durationMs: 0, evidence: [],
      };
    }

    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const judge = new LLMJudge({ ...llmConfig, maxTokens: 3000 });

    // Build cross-gate summaries from actual results
    const gate1Summary = this.summarizeGate(ctx, 1);
    const gate2Summary = this.summarizeGate(ctx, 2);
    const gate3Summary = this.summarizeGate(ctx, 3);

    // Collect Gate 4 scores from sibling validators (they ran before us)
    const gate4Current = ctx.gateResults.find((g) => g.gateNumber === 4);
    const gate4Scores = (gate4Current?.validatorResults ?? [])
      .filter((v) => v.details.avgScore !== undefined)
      .map((v) => ({
        validator: v.validatorName,
        avgScore: v.details.avgScore as number,
        failCount: (v.details.failCount as number) ?? 0,
      }));

    // Collect all fixes from Gate 4 sibling validators
    const allFixes: Array<{ tool: string; fixes: string[] }> = [];
    for (const v of gate4Current?.validatorResults ?? []) {
      if (v.details.perToolFixes && Array.isArray(v.details.perToolFixes)) {
        allFixes.push(...(v.details.perToolFixes as Array<{ tool: string; fixes: string[] }>));
      }
    }

    const serverName = ctx.initializeResult?.serverInfo?.name ?? ctx.serverTarget.command ?? ctx.serverTarget.url ?? "unknown";

    const prompt = holisticSummaryPrompt(
      serverName,
      ctx.toolDefinitions.length,
      gate1Summary,
      gate2Summary,
      gate3Summary,
      gate4Scores,
      allFixes
    );

    const verdict = await judge.evaluate(prompt);

    // Format the fixes as structured evidence
    const evidence: string[] = [];
    if (verdict.fixes.length > 0) {
      for (const fix of verdict.fixes) {
        evidence.push(fix);
      }
    }
    if (verdict.reasoning) {
      evidence.unshift(`Summary: ${verdict.reasoning}`);
    }

    return {
      validatorName: this.name,
      severity: verdict.verdict === "pass" ? Severity.PASS : verdict.verdict === "warn" ? Severity.WARN : Severity.FAIL,
      message: `Overall server quality: ${verdict.score}/5 — ${verdict.fixes.length} improvement(s) identified`,
      details: {
        overallScore: verdict.score,
        fixCount: verdict.fixes.length,
        gatesCrossReferenced: ctx.gateResults.map((g) => g.gateNumber),
      },
      durationMs: 0,
      evidence,
    };
  }

  /** Summarize a gate's findings into a compact string for the LLM prompt. */
  private summarizeGate(ctx: ValidationContext, gateNumber: number): string {
    const gate = ctx.gateResults.find((g) => g.gateNumber === gateNumber);
    if (!gate) return "Gate not run";

    const lines: string[] = [];
    lines.push(`${gate.gateName}: ${gate.severity.toUpperCase()}`);

    for (const v of gate.validatorResults) {
      if (v.severity === Severity.PASS || v.severity === Severity.SKIP) continue;
      lines.push(`  [${v.severity.toUpperCase()}] ${v.validatorName}: ${v.message}`);
      // Include top 3 evidence items for context
      for (const e of v.evidence.slice(0, 3)) {
        lines.push(`    → ${e}`);
      }
      if (v.evidence.length > 3) {
        lines.push(`    ... and ${v.evidence.length - 3} more`);
      }
    }

    return lines.length > 1 ? lines.join("\n") : `${gate.gateName}: all validators passed`;
  }
}
