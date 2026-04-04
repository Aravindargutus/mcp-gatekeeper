/**
 * ValidationContext is the shared state bag that flows through the entire pipeline.
 * Each gate enriches it for downstream gates:
 *
 * - Gate 1 populates toolDefinitions
 * - Gate 3 populates invocationResults
 * - Gate 4 reads both to compare descriptions against actual behavior
 */

import type { IMCPConnector } from "./interfaces.js";
import type {
  GateResult,
  MCPInitializeResult,
  ServerCapabilities,
  ToolCallResult,
  ToolDefinition,
} from "./types.js";
import type { PipelineConfig, ServerTarget } from "./config.js";

export class ValidationContext {
  public toolDefinitions: ToolDefinition[] = [];
  public serverCapabilities: ServerCapabilities = {};
  public initializeResult: MCPInitializeResult | null = null;
  public invocationResults: Map<string, ToolCallResult> = new Map();
  public errorResponses: Map<string, unknown> = new Map();
  public gateResults: GateResult[] = [];
  public rawResponses: Map<string, unknown> = new Map();
  /** Path to a Claude Code skill directory (for Gate 6) */
  public skillPath?: string;
  /** Path to a Claude Desktop extension directory (for Gate 7) */
  public extensionPath?: string;
  /** Path to an npm package directory (for Gate 8) */
  public packagePath?: string;
  /** MCP Resources from the server (Gate 9) */
  public resources: Array<Record<string, unknown>> = [];
  /** MCP Prompts from the server (Gate 10) */
  public prompts: Array<Record<string, unknown>> = [];
  /** Number of LLM trials for pass@k evaluation (Gate 4) */
  public trials: number = 1;
  /** Shared transcript recorder for Gate 4 LLM conversations */
  public transcriptRecorder?: unknown;

  constructor(
    public readonly connector: IMCPConnector,
    public readonly serverTarget: ServerTarget,
    public readonly config: PipelineConfig
  ) {
    this.skillPath = serverTarget.skillPath;
    this.extensionPath = serverTarget.extensionPath;
    this.packagePath = serverTarget.packagePath;
  }

  addGateResult(result: GateResult): void {
    this.gateResults.push(result);
  }

  getToolByName(name: string): ToolDefinition | undefined {
    return this.toolDefinitions.find((t) => t.name === name);
  }

  hasPassedGate(gateNumber: number): boolean {
    const result = this.gateResults.find((r) => r.gateNumber === gateNumber);
    return result?.severity === "pass" || result?.severity === "warn";
  }
}
