/**
 * BaseGate — holds an ordered list of validators and orchestrates their execution.
 *
 * Handles:
 * - Validator dependency resolution (auto-SKIP if a prerequisite was disabled/failed)
 * - failOnWarn config (promotes WARN gate severity to FAIL)
 * - Per-gate timeout via AbortSignal
 * - Crash isolation (validator exceptions become ERROR results)
 */

import type { IGate, IValidator, IReporter } from "./interfaces.js";
import type { ValidationContext } from "./context.js";
import type { GateResult, ValidatorResult } from "./types.js";
import { Severity, worstSeverity, isBlocking } from "./types.js";

export abstract class BaseGate implements IGate {
  abstract readonly gateNumber: number;
  abstract readonly gateName: string;

  protected _validators: IValidator[] = [];
  private _reporters: IReporter[] = [];

  get validators(): IValidator[] {
    return [...this._validators];
  }

  setReporters(reporters: IReporter[]): void {
    this._reporters = reporters;
  }

  protected registerValidator(validator: IValidator): void {
    this._validators.push(validator);
  }

  async execute(ctx: ValidationContext, signal?: AbortSignal): Promise<GateResult> {
    const startedAt = new Date();
    const validatorResults: ValidatorResult[] = [];
    /** Track completed validator names → severity for dependency resolution */
    const completed = new Map<string, Severity>();

    for (const validator of this._validators) {
      // Check abort signal
      if (signal?.aborted) {
        validatorResults.push({
          validatorName: validator.name,
          severity: Severity.SKIP,
          message: `Validator "${validator.name}" skipped — gate timed out`,
          details: {},
          durationMs: 0,
          evidence: [],
        });
        continue;
      }

      // Check if validator is enabled
      if (!this.isValidatorEnabled(ctx, validator.name)) {
        const skipResult: ValidatorResult = {
          validatorName: validator.name,
          severity: Severity.SKIP,
          message: `Validator "${validator.name}" is disabled by config`,
          details: {},
          durationMs: 0,
          evidence: [],
        };
        validatorResults.push(skipResult);
        completed.set(validator.name, Severity.SKIP);
        this._reporters.forEach((r) => r.onValidatorComplete(skipResult));
        continue;
      }

      // Check dependencies
      const unmetDeps = this.checkDependencies(validator, completed);
      if (unmetDeps.length > 0) {
        const skipResult: ValidatorResult = {
          validatorName: validator.name,
          severity: Severity.SKIP,
          message: `Skipped: requires [${unmetDeps.join(", ")}] which was disabled, failed, or not run`,
          details: { unmetDependencies: unmetDeps },
          durationMs: 0,
          evidence: [],
        };
        validatorResults.push(skipResult);
        completed.set(validator.name, Severity.SKIP);
        this._reporters.forEach((r) => r.onValidatorComplete(skipResult));
        continue;
      }

      // Run the validator
      const validatorStart = performance.now();
      try {
        const result = await validator.validate(ctx);
        result.durationMs = performance.now() - validatorStart;
        validatorResults.push(result);
        completed.set(validator.name, result.severity);
        this._reporters.forEach((r) => r.onValidatorComplete(result));
      } catch (err) {
        const duration = performance.now() - validatorStart;
        const errorResult: ValidatorResult = {
          validatorName: validator.name,
          severity: Severity.ERROR,
          message:
            err instanceof Error
              ? `Validator crashed: ${err.message}`
              : "Validator crashed with unknown error",
          details: {
            error: err instanceof Error ? err.stack : String(err),
          },
          durationMs: duration,
          evidence: [],
        };
        validatorResults.push(errorResult);
        completed.set(validator.name, Severity.ERROR);
        this._reporters.forEach((r) => r.onValidatorComplete(errorResult));
      }
    }

    const completedAt = new Date();
    let severity = worstSeverity(validatorResults.map((r) => r.severity));

    // failOnWarn: promote WARN to FAIL if configured
    const gateConfig = ctx.config.gates[this.gateNumber as keyof typeof ctx.config.gates];
    if (gateConfig?.failOnWarn && severity === Severity.WARN) {
      severity = Severity.FAIL;
    }

    return {
      gateNumber: this.gateNumber,
      gateName: this.gateName,
      severity,
      validatorResults,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      metadata: {},
    };
  }

  /** Returns names of unmet dependencies (disabled, failed, errored, or not yet run). */
  private checkDependencies(
    validator: IValidator,
    completed: Map<string, Severity>
  ): string[] {
    if (!validator.dependencies || validator.dependencies.length === 0) return [];

    const unmet: string[] = [];
    for (const dep of validator.dependencies) {
      const depSeverity = completed.get(dep);
      // Unmet if: not run, or ran but blocked/skipped
      if (!depSeverity || isBlocking(depSeverity) || depSeverity === Severity.SKIP) {
        unmet.push(dep);
      }
    }
    return unmet;
  }

  private isValidatorEnabled(ctx: ValidationContext, validatorName: string): boolean {
    const gateConfig = ctx.config.gates[this.gateNumber as keyof typeof ctx.config.gates];
    if (!gateConfig) return true;
    const validatorConfig = gateConfig.validators[validatorName];
    if (!validatorConfig) return true;
    return validatorConfig.enabled !== false;
  }
}
