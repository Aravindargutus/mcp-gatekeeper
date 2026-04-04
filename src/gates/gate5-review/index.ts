import { BaseGate } from "../../core/gate.js";
import type { ValidationContext } from "../../core/context.js";
import type { GateResult } from "../../core/types.js";
import { Severity } from "../../core/types.js";
import { ReviewStorage } from "./storage.js";

/**
 * Gate 5: Human Review — creates a review record in the dashboard.
 *
 * Auto-approve logic: If all previous gate scores are PASS (no WARN/FAIL),
 * the review is auto-approved. Otherwise, it's left pending for human review.
 *
 * This gate doesn't have traditional validators — it's a workflow gate.
 */
export class ReviewGate extends BaseGate {
  readonly gateNumber = 5;
  readonly gateName = "Human Review";

  async execute(ctx: ValidationContext): Promise<GateResult> {
    const startedAt = new Date();

    // Check if all previous gates passed cleanly
    const allClean = ctx.gateResults.every(
      (g) => g.severity === Severity.PASS || g.severity === Severity.SKIP
    );

    const autoApproveThreshold = ((ctx.config as Record<string, unknown>).semantic as Record<string, unknown>)?.autoApproveThreshold as number ?? 4.5;
    const gate4 = ctx.gateResults.find((g) => g.gateNumber === 4);
    const semanticScores = gate4?.validatorResults
      .filter((v) => v.details.avgScore !== undefined)
      .map((v) => v.details.avgScore as number) ?? [];
    const avgSemanticScore = semanticScores.length > 0
      ? semanticScores.reduce((a, b) => a + b, 0) / semanticScores.length
      : 0;

    const autoApproved = allClean || avgSemanticScore >= autoApproveThreshold;

    // Create review record
    try {
      const dbDir = (ctx.config as Record<string, unknown>).reviewDbDir as string ?? "./data";
      const storage = new ReviewStorage(dbDir);

      // Build a partial report for storage
      const report = {
        pipelineId: `review-${Date.now()}`,
        serverTarget: ctx.serverTarget.command ?? ctx.serverTarget.url ?? "unknown",
        gateResults: ctx.gateResults,
        overallSeverity: autoApproved ? Severity.PASS : Severity.WARN,
        startedAt: ctx.gateResults[0]?.startedAt ?? startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        configSnapshot: {},
      };

      storage.createReview(report);

      if (autoApproved) {
        storage.approve(report.pipelineId, "system", "Auto-approved: all gates passed cleanly");
      }

      storage.close();

      return {
        gateNumber: this.gateNumber,
        gateName: this.gateName,
        severity: autoApproved ? Severity.PASS : Severity.WARN,
        validatorResults: [
          {
            validatorName: "review-submission",
            severity: autoApproved ? Severity.PASS : Severity.WARN,
            message: autoApproved
              ? "Auto-approved: all previous gates passed cleanly"
              : "Review submitted — pending human approval. Run `mcpqa dashboard` to review.",
            details: { autoApproved, avgSemanticScore, pipelineId: report.pipelineId },
            durationMs: 0,
            evidence: autoApproved
              ? ["All gates passed with no warnings or failures"]
              : ["Review requires human approval at http://localhost:8080"],
          },
        ],
        durationMs: Date.now() - startedAt.getTime(),
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        metadata: { autoApproved },
      };
    } catch (err) {
      return {
        gateNumber: this.gateNumber,
        gateName: this.gateName,
        severity: Severity.WARN,
        validatorResults: [
          {
            validatorName: "review-submission",
            severity: Severity.WARN,
            message: `Review storage unavailable: ${err instanceof Error ? err.message : String(err)}`,
            details: {},
            durationMs: 0,
            evidence: ["Dashboard not configured — results shown in console only"],
          },
        ],
        durationMs: Date.now() - startedAt.getTime(),
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        metadata: {},
      };
    }
  }
}
