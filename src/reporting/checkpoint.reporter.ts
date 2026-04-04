import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { BaseReporter } from "./base.reporter.js";
import type { GateResult, PipelineReport, ValidatorResult } from "../core/types.js";
import { logger } from "../utils/logger.js";

/**
 * CheckpointReporter — saves partial progress after each gate completes.
 * If the pipeline crashes mid-run, the checkpoint file contains all
 * completed gate results. Users can inspect it to see how far it got.
 */
export class CheckpointReporter extends BaseReporter {
  private partialReport: Partial<PipelineReport> = {};
  private readonly checkpointPath: string;

  constructor(private readonly outputDir: string) {
    super();
    this.checkpointPath = join(outputDir, "checkpoint.json");
  }

  onGateStart(_gateNumber: number, _gateName: string): void {}

  onGateComplete(result: GateResult): void {
    if (!this.partialReport.gateResults) {
      this.partialReport.gateResults = [];
    }
    this.partialReport.gateResults.push(result);
    this.saveCheckpoint();
  }

  onValidatorComplete(_result: ValidatorResult): void {}

  async finalize(report: PipelineReport): Promise<void> {
    // Pipeline completed — remove checkpoint (no longer needed)
    this.partialReport = report;
    this.removeCheckpoint();
  }

  setPipelineInfo(pipelineId: string, serverTarget: string): void {
    this.partialReport.pipelineId = pipelineId;
    this.partialReport.serverTarget = serverTarget;
    this.partialReport.startedAt = new Date().toISOString();
  }

  private saveCheckpoint(): void {
    try {
      mkdirSync(this.outputDir, { recursive: true });
      writeFileSync(this.checkpointPath, JSON.stringify(this.partialReport, null, 2));
      logger.debug(`Checkpoint saved: ${this.partialReport.gateResults?.length ?? 0} gate(s) completed`);
    } catch (err) {
      logger.error(`Failed to save checkpoint: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private removeCheckpoint(): void {
    try {
      const { unlinkSync } = require("fs");
      if (existsSync(this.checkpointPath)) {
        unlinkSync(this.checkpointPath);
        logger.debug("Checkpoint removed (pipeline completed successfully)");
      }
    } catch {
      // Not critical
    }
  }

  /** Static helper to load a previous checkpoint if it exists. */
  static loadCheckpoint(outputDir: string): Partial<PipelineReport> | null {
    const checkpointPath = join(outputDir, "checkpoint.json");
    if (!existsSync(checkpointPath)) return null;
    try {
      return JSON.parse(readFileSync(checkpointPath, "utf-8"));
    } catch {
      return null;
    }
  }
}
