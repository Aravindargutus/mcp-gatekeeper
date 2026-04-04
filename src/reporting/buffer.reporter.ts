import { BaseReporter } from "./base.reporter.js";
import type { GateResult, PipelineReport, ValidatorResult } from "../core/types.js";

const MAX_REPORTS = 50;

/**
 * BufferReporter — stores reports in an in-memory map.
 * Used by the MCP server to serve reports via the get_report tool.
 */
export class BufferReporter extends BaseReporter {
  constructor(private readonly store: Map<string, PipelineReport>) {
    super();
  }

  onGateStart(_gateNumber: number, _gateName: string): void {}
  onGateComplete(_result: GateResult): void {}
  onValidatorComplete(_result: ValidatorResult): void {}

  async finalize(report: PipelineReport): Promise<void> {
    // Evict oldest if at capacity
    if (this.store.size >= MAX_REPORTS) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(report.pipelineId, report);
  }
}
