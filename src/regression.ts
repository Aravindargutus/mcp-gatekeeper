import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import type { PipelineReport, GateResult, ValidatorResult } from "./core/types.js";
import { Severity } from "./core/types.js";
import { logger } from "./utils/logger.js";

export interface RegressionBaseline {
  pipelineId: string;
  serverTarget: string;
  savedAt: string;
  gateScores: Record<number, { severity: string; passCount: number; totalCount: number }>;
  validatorScores: Record<string, { severity: string; partialCredit?: number }>;
}

/**
 * Regression tracker — saves baselines and detects regressions.
 *
 * From Anthropic's eval article:
 * - Capability evals: "What can this agent do?" (start at low pass, improve)
 * - Regression evals: "Does it still do what it used to?" (maintain ~100%)
 *
 * Usage:
 *   1. Run pipeline, save baseline: mcpqa run --save-baseline
 *   2. Later: mcpqa run --check-regression (compares against saved baseline)
 *   3. If any previously-passing validator now fails → REGRESSION detected
 */
export class RegressionTracker {
  private baselineDir: string;

  constructor(outputDir: string = "./reports") {
    this.baselineDir = join(outputDir, "baselines");
  }

  /** Save current report as the baseline for future regression checks. */
  saveBaseline(report: PipelineReport): string {
    mkdirSync(this.baselineDir, { recursive: true });

    const baseline: RegressionBaseline = {
      pipelineId: report.pipelineId,
      serverTarget: report.serverTarget,
      savedAt: new Date().toISOString(),
      gateScores: {},
      validatorScores: {},
    };

    for (const gate of report.gateResults) {
      const passCount = gate.validatorResults.filter((v) => v.severity === Severity.PASS).length;
      baseline.gateScores[gate.gateNumber] = {
        severity: gate.severity,
        passCount,
        totalCount: gate.validatorResults.length,
      };

      for (const v of gate.validatorResults) {
        const key = `gate${gate.gateNumber}/${v.validatorName}`;
        baseline.validatorScores[key] = {
          severity: v.severity,
          partialCredit: v.partialCredit,
        };
      }
    }

    const filename = `baseline-${report.serverTarget.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
    const filepath = join(this.baselineDir, filename);
    writeFileSync(filepath, JSON.stringify(baseline, null, 2));

    // Also save as "latest"
    writeFileSync(join(this.baselineDir, "latest.json"), JSON.stringify(baseline, null, 2));
    logger.info(`Baseline saved: ${filepath}`);
    return filepath;
  }

  /** Load the most recent baseline for a server. */
  loadBaseline(serverTarget?: string): RegressionBaseline | null {
    if (serverTarget) {
      const filename = `baseline-${serverTarget.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
      const filepath = join(this.baselineDir, filename);
      if (existsSync(filepath)) {
        return JSON.parse(readFileSync(filepath, "utf-8"));
      }
    }

    // Fall back to latest
    const latestPath = join(this.baselineDir, "latest.json");
    if (existsSync(latestPath)) {
      return JSON.parse(readFileSync(latestPath, "utf-8"));
    }
    return null;
  }

  /** Compare current report against baseline. Returns regressions found. */
  checkRegression(report: PipelineReport, baseline: RegressionBaseline): RegressionResult {
    const regressions: RegressionItem[] = [];
    const improvements: RegressionItem[] = [];

    for (const gate of report.gateResults) {
      for (const v of gate.validatorResults) {
        const key = `gate${gate.gateNumber}/${v.validatorName}`;
        const baselineScore = baseline.validatorScores[key];

        if (!baselineScore) {
          // New validator — not a regression
          continue;
        }

        const wasPass = baselineScore.severity === Severity.PASS;
        const isPass = v.severity === Severity.PASS;

        if (wasPass && !isPass) {
          regressions.push({
            gate: gate.gateNumber,
            validator: v.validatorName,
            baselineSeverity: baselineScore.severity as Severity,
            currentSeverity: v.severity,
            message: v.message,
          });
        } else if (!wasPass && isPass) {
          improvements.push({
            gate: gate.gateNumber,
            validator: v.validatorName,
            baselineSeverity: baselineScore.severity as Severity,
            currentSeverity: v.severity,
            message: v.message,
          });
        }
      }
    }

    return {
      hasRegressions: regressions.length > 0,
      regressionCount: regressions.length,
      improvementCount: improvements.length,
      regressions,
      improvements,
      baseline,
    };
  }

  /** Format regression result for console output. */
  formatResult(result: RegressionResult): string {
    const lines: string[] = [];

    if (result.regressions.length > 0) {
      lines.push(chalk.red.bold(`\n⚠ ${result.regressionCount} REGRESSION(S) DETECTED`));
      lines.push(chalk.dim(`  Baseline: ${result.baseline.pipelineId} (${result.baseline.savedAt})`));
      for (const r of result.regressions) {
        lines.push(chalk.red(`  ✗ Gate ${r.gate}/${r.validator}: ${r.baselineSeverity} → ${r.currentSeverity}`));
        lines.push(chalk.gray(`    ${r.message}`));
      }
    }

    if (result.improvements.length > 0) {
      lines.push(chalk.green(`\n▲ ${result.improvementCount} IMPROVEMENT(S)`));
      for (const i of result.improvements) {
        lines.push(chalk.green(`  ✓ Gate ${i.gate}/${i.validator}: ${i.baselineSeverity} → ${i.currentSeverity}`));
      }
    }

    if (result.regressions.length === 0 && result.improvements.length === 0) {
      lines.push(chalk.dim("\n  No changes from baseline."));
    }

    return lines.join("\n");
  }
}

export interface RegressionItem {
  gate: number;
  validator: string;
  baselineSeverity: Severity;
  currentSeverity: Severity;
  message: string;
}

export interface RegressionResult {
  hasRegressions: boolean;
  regressionCount: number;
  improvementCount: number;
  regressions: RegressionItem[];
  improvements: RegressionItem[];
  baseline: RegressionBaseline;
}
