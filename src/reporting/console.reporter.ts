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

export class ConsoleReporter extends BaseReporter {
  onGateStart(gateNumber: number, gateName: string): void {
    console.log("");
    console.log(
      chalk.bold.cyan(`━━━ Gate ${gateNumber}: ${gateName} ━━━`)
    );
  }

  onGateComplete(result: GateResult): void {
    const badge = SEVERITY_BADGE[result.severity];
    const duration = formatDuration(result.durationMs);
    console.log(
      `  ${badge} ${chalk.bold(result.gateName)} (${duration})`
    );
  }

  onValidatorComplete(result: ValidatorResult): void {
    const icon =
      result.severity === Severity.PASS
        ? chalk.green("  ✓")
        : result.severity === Severity.WARN
          ? chalk.yellow("  ⚠")
          : result.severity === Severity.SKIP
            ? chalk.gray("  ○")
            : chalk.red("  ✗");

    console.log(`${icon} ${result.validatorName}: ${result.message}`);

    // Show evidence for non-pass results
    if (result.severity !== Severity.PASS && result.severity !== Severity.SKIP) {
      for (const item of result.evidence.slice(0, 5)) {
        console.log(chalk.gray(`      → ${item}`));
      }
      if (result.evidence.length > 5) {
        console.log(
          chalk.gray(
            `      ... and ${result.evidence.length - 5} more`
          )
        );
      }
    }
  }

  async finalize(report: PipelineReport): Promise<void> {
    console.log("");
    console.log(chalk.bold("═══ Pipeline Summary ═══"));
    console.log(`  Pipeline ID: ${chalk.dim(report.pipelineId)}`);
    console.log(`  Server:      ${report.serverTarget}`);

    const totalDuration = report.completedAt && report.startedAt
      ? new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime()
      : 0;
    console.log(`  Duration:    ${formatDuration(totalDuration)}`);
    console.log("");

    for (const gate of report.gateResults) {
      const badge = SEVERITY_BADGE[gate.severity];
      const passed = gate.validatorResults.filter(
        (v) => v.severity === Severity.PASS
      ).length;
      const total = gate.validatorResults.length;
      console.log(
        `  ${badge} Gate ${gate.gateNumber}: ${gate.gateName} — ${passed}/${total} passed`
      );
    }

    console.log("");
    const overallBadge = SEVERITY_BADGE[report.overallSeverity];
    console.log(`  Overall: ${overallBadge}`);
    console.log("");
  }
}
