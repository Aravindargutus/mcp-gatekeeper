import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { BaseReporter } from "./base.reporter.js";
import type { GateResult, PipelineReport, ValidatorResult } from "../core/types.js";
import { logger } from "../utils/logger.js";

export class JsonReporter extends BaseReporter {
  constructor(private readonly outputDir: string) {
    super();
  }

  onGateStart(_gateNumber: number, _gateName: string): void {}
  onGateComplete(_result: GateResult): void {}
  onValidatorComplete(_result: ValidatorResult): void {}

  async finalize(report: PipelineReport): Promise<void> {
    try {
      mkdirSync(this.outputDir, { recursive: true });
    } catch (err) {
      logger.error(
        `Failed to create report directory "${this.outputDir}": ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    let json: string;
    try {
      json = JSON.stringify(report, null, 2);
    } catch (err) {
      logger.error(
        `Failed to serialize report to JSON: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    const filename = `mcpqa-${report.pipelineId}.json`;
    const filepath = join(this.outputDir, filename);
    try {
      writeFileSync(filepath, json);
      logger.debug(`Report written to ${filepath}`);
    } catch (err) {
      logger.error(`Failed to write report to "${filepath}": ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      writeFileSync(join(this.outputDir, "latest.json"), json);
    } catch (err) {
      logger.error(`Failed to write latest.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
