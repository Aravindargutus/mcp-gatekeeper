import type { IReporter } from "../core/interfaces.js";
import type { GateResult, PipelineReport, ValidatorResult } from "../core/types.js";

export abstract class BaseReporter implements IReporter {
  abstract onGateStart(gateNumber: number, gateName: string): void;
  abstract onGateComplete(result: GateResult): void;
  abstract onValidatorComplete(result: ValidatorResult): void;
  abstract finalize(report: PipelineReport): Promise<void>;
}
