/**
 * Core interfaces defining the plugin architecture.
 *
 * Three ABCs define the entire system:
 * - IValidator (Strategy): Each check is an independent, testable unit
 * - IGate: Holds validators, orchestrates execution, aggregates results
 * - IReporter (Observer): Receives real-time gate completion events
 */

import type { ValidationContext } from "./context.js";
import type {
  GateResult,
  MCPInitializeResult,
  PipelineReport,
  ToolCallResult,
  ToolDefinition,
  ValidatorResult,
} from "./types.js";

export interface IValidator {
  readonly name: string;
  readonly description: string;
  /** Names of validators that must run (and not fail) before this one. */
  readonly dependencies?: string[];
  validate(ctx: ValidationContext): Promise<ValidatorResult>;
}

export interface IGate {
  readonly gateNumber: number;
  readonly gateName: string;
  readonly validators: IValidator[];
  execute(ctx: ValidationContext, signal?: AbortSignal): Promise<GateResult>;
}

export interface IReporter {
  onGateStart(gateNumber: number, gateName: string): void;
  onGateComplete(result: GateResult): void;
  onValidatorComplete(result: ValidatorResult): void;
  finalize(report: PipelineReport): Promise<void>;
}

export interface IMCPConnector {
  connect(): Promise<MCPInitializeResult>;
  disconnect(): Promise<void>;
  listTools(): Promise<ToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
  sendRawRequest(method: string, params?: Record<string, unknown>): Promise<unknown>;
  readonly isConnected: boolean;
}
