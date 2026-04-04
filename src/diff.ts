import chalk from "chalk";
import { readFileSync } from "fs";
import type { PipelineReport, GateResult, ValidatorResult } from "./core/types.js";
import { Severity } from "./core/types.js";

/**
 * Compare two MCPQA reports and show what changed.
 * Useful for tracking improvements after fixing issues.
 */
export function diffReports(beforePath: string, afterPath: string): string {
  const before: PipelineReport = JSON.parse(readFileSync(beforePath, "utf-8"));
  const after: PipelineReport = JSON.parse(readFileSync(afterPath, "utf-8"));

  const lines: string[] = [];
  lines.push(chalk.bold("═══ MCPQA Report Diff ═══"));
  lines.push(`  Before: ${before.pipelineId} (${before.overallSeverity.toUpperCase()})`);
  lines.push(`  After:  ${after.pipelineId} (${after.overallSeverity.toUpperCase()})`);

  // Overall severity change
  if (before.overallSeverity !== after.overallSeverity) {
    const arrow = severityImproved(before.overallSeverity, after.overallSeverity)
      ? chalk.green("▲ improved")
      : chalk.red("▼ regressed");
    lines.push(`  Overall: ${before.overallSeverity} → ${after.overallSeverity} ${arrow}`);
  } else {
    lines.push(`  Overall: ${chalk.dim("no change")} (${after.overallSeverity})`);
  }
  lines.push("");

  // Gate-by-gate comparison
  const allGateNumbers = new Set([
    ...before.gateResults.map((g) => g.gateNumber),
    ...after.gateResults.map((g) => g.gateNumber),
  ]);

  for (const gateNum of [...allGateNumbers].sort()) {
    const bGate = before.gateResults.find((g) => g.gateNumber === gateNum);
    const aGate = after.gateResults.find((g) => g.gateNumber === gateNum);

    if (!bGate && aGate) {
      lines.push(chalk.green(`  + Gate ${gateNum}: ${aGate.gateName} [NEW — ${aGate.severity}]`));
      continue;
    }
    if (bGate && !aGate) {
      lines.push(chalk.red(`  - Gate ${gateNum}: ${bGate.gateName} [REMOVED]`));
      continue;
    }
    if (!bGate || !aGate) continue;

    const bPass = bGate.validatorResults.filter((v) => v.severity === Severity.PASS).length;
    const aPass = aGate.validatorResults.filter((v) => v.severity === Severity.PASS).length;
    const bTotal = bGate.validatorResults.length;
    const aTotal = aGate.validatorResults.length;

    const changed = bGate.severity !== aGate.severity || bPass !== aPass;
    const prefix = changed ? chalk.yellow("~") : chalk.dim("=");
    lines.push(
      `  ${prefix} Gate ${gateNum}: ${aGate.gateName} — ${bPass}/${bTotal} → ${aPass}/${aTotal} passed`
    );

    // Show individual validator changes
    if (changed) {
      const bMap = new Map(bGate.validatorResults.map((v) => [v.validatorName, v]));
      for (const aVal of aGate.validatorResults) {
        const bVal = bMap.get(aVal.validatorName);
        if (!bVal) {
          lines.push(chalk.green(`      + ${aVal.validatorName}: ${aVal.severity}`));
        } else if (bVal.severity !== aVal.severity) {
          const arrow = severityImproved(bVal.severity, aVal.severity)
            ? chalk.green("▲")
            : chalk.red("▼");
          lines.push(`      ${arrow} ${aVal.validatorName}: ${bVal.severity} → ${aVal.severity}`);
        }
      }
    }
  }

  // Evidence count comparison
  const bEvidenceCount = countEvidence(before);
  const aEvidenceCount = countEvidence(after);
  lines.push("");
  const diff = aEvidenceCount - bEvidenceCount;
  if (diff < 0) {
    lines.push(chalk.green(`  ${Math.abs(diff)} fewer issue(s) (${bEvidenceCount} → ${aEvidenceCount})`));
  } else if (diff > 0) {
    lines.push(chalk.red(`  ${diff} more issue(s) (${bEvidenceCount} → ${aEvidenceCount})`));
  } else {
    lines.push(chalk.dim(`  Same issue count: ${aEvidenceCount}`));
  }
  lines.push("");

  return lines.join("\n");
}

const SEVERITY_ORDER: Record<string, number> = {
  pass: 0, skip: 0, warn: 2, fail: 3, error: 4,
};

function severityImproved(before: Severity, after: Severity): boolean {
  return (SEVERITY_ORDER[after] ?? 0) < (SEVERITY_ORDER[before] ?? 0);
}

function countEvidence(report: PipelineReport): number {
  return report.gateResults.reduce(
    (sum, g) => sum + g.validatorResults.reduce((s, v) => s + v.evidence.length, 0),
    0
  );
}
