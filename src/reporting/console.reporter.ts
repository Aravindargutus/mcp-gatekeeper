import chalk from "chalk";
import { BaseReporter } from "./base.reporter.js";
import type { GateResult, PipelineReport, ValidatorResult } from "../core/types.js";
import { Severity } from "../core/types.js";
import { formatDuration } from "../utils/timing.js";

const SEVERITY_BADGE: Record<Severity, string> = {
  [Severity.PASS]: chalk.bgGreen.black(" PASS "),
  [Severity.WARN]: chalk.bgYellow.black(" WARN "),
  [Severity.FAIL]: chalk.bgRed.white(" FAIL "),
  [Severity.SKIP]: chalk.bgGray.white(" SKIP "),
  [Severity.ERROR]: chalk.bgMagenta.white(" ERR  "),
};

const SEVERITY_ICON: Record<Severity, string> = {
  [Severity.PASS]: chalk.green("✓"),
  [Severity.WARN]: chalk.yellow("⚠"),
  [Severity.FAIL]: chalk.red("✗"),
  [Severity.SKIP]: chalk.gray("○"),
  [Severity.ERROR]: chalk.magenta("!"),
};

export class ConsoleReporter extends BaseReporter {
  private gateValidatorCount = 0;
  private gateValidatorDone = 0;
  private gateStartTime = 0;

  onGateStart(gateNumber: number, gateName: string): void {
    this.gateValidatorDone = 0;
    this.gateStartTime = Date.now();
    console.log("");
    console.log(chalk.bold.cyan(`━━━ Gate ${gateNumber}: ${gateName} ━━━`));
  }

  onGateComplete(result: GateResult): void {
    const badge = SEVERITY_BADGE[result.severity];
    const duration = formatDuration(result.durationMs);
    console.log(`  ${badge} ${chalk.bold(result.gateName)} (${duration})`);
  }

  onValidatorComplete(result: ValidatorResult): void {
    this.gateValidatorDone++;
    const icon = SEVERITY_ICON[result.severity];
    const elapsed = formatDuration(result.durationMs);
    const timing = result.durationMs > 1000 ? chalk.dim(` [${elapsed}]`) : "";

    console.log(`  ${icon} ${result.validatorName}: ${result.message}${timing}`);

    // Show evidence for non-pass results
    if (result.severity !== Severity.PASS && result.severity !== Severity.SKIP) {
      for (const item of result.evidence.slice(0, 5)) {
        console.log(chalk.gray(`      → ${item}`));
      }
      if (result.evidence.length > 5) {
        console.log(chalk.gray(`      ... and ${result.evidence.length - 5} more`));
      }
    }
  }

  async finalize(report: PipelineReport): Promise<void> {
    const totalDuration =
      report.completedAt && report.startedAt
        ? new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime()
        : 0;

    console.log("");
    console.log(chalk.bold("═══ Pipeline Summary ═══"));
    console.log(`  Pipeline ID: ${chalk.dim(report.pipelineId)}`);
    console.log(`  Server:      ${report.serverTarget}`);
    console.log(`  Duration:    ${formatDuration(totalDuration)}`);
    console.log("");

    // Gate summary with progress bar
    let totalValidators = 0;
    let passedValidators = 0;
    for (const gate of report.gateResults) {
      const badge = SEVERITY_BADGE[gate.severity];
      const passed = gate.validatorResults.filter((v) => v.severity === Severity.PASS).length;
      const total = gate.validatorResults.length;
      totalValidators += total;
      passedValidators += passed;

      const bar = this.progressBar(passed, total, 20);
      console.log(`  ${badge} Gate ${gate.gateNumber}: ${gate.gateName} — ${bar} ${passed}/${total}`);
    }

    // Overall progress bar
    console.log("");
    const overallBar = this.progressBar(passedValidators, totalValidators, 30);
    const overallBadge = SEVERITY_BADGE[report.overallSeverity];
    console.log(`  Overall: ${overallBadge} ${overallBar} ${passedValidators}/${totalValidators} validators passed`);
    console.log("");
  }

  private progressBar(current: number, total: number, width: number): string {
    if (total === 0) return chalk.gray("░".repeat(width));
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const ratio = current / total;
    const color = ratio >= 0.9 ? chalk.green : ratio >= 0.6 ? chalk.yellow : chalk.red;
    return color("█".repeat(filled)) + chalk.gray("░".repeat(empty));
  }
}
