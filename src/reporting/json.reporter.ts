import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { BaseReporter } from "./base.reporter.js";
import type { GateResult, PipelineReport, ValidatorResult } from "../core/types.js";

export class JsonReporter extends BaseReporter {
  constructor(private readonly outputDir: string) {
    super();
  }

  onGateStart(_gateNumber: number, _gateName: string): void {}
  onGateComplete(_result: GateResult): void {}
  onValidatorComplete(_result: ValidatorResult): void {}

  async finalize(report: PipelineReport): Promise<void> {
    mkdirSync(this.outputDir, { recursive: true });
    const filename = `mcpqa-${report.pipelineId}.json`;
    const filepath = join(this.outputDir, filename);
    writeFileSync(filepath, JSON.stringify(report, null, 2));

    // Also write a "latest" symlink-like file
    const latestPath = join(this.outputDir, "latest.json");
    writeFileSync(latestPath, JSON.stringify(report, null, 2));
  }
}
