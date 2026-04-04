/**
 * Core type definitions for the MCP QA Framework.
 * These types flow through the entire pipeline — from individual validators
 * up through gates to the final pipeline report.
 */

export enum Severity {
  PASS = "pass",
  WARN = "warn",
  FAIL = "fail",
  SKIP = "skip",
  ERROR = "error",
}

/** Priority order for determining worst severity. SKIP = 0 same as PASS (disabled validators don't degrade results). */
const SEVERITY_PRIORITY: Record<Severity, number> = {
  [Severity.PASS]: 0,
  [Severity.SKIP]: 0,
  [Severity.WARN]: 2,
  [Severity.FAIL]: 3,
  [Severity.ERROR]: 4,
};

/** Returns the worst severity from a list, filtering out SKIPs before aggregation. */
export function worstSeverity(severities: Severity[]): Severity {
  const active = severities.filter((s) => s !== Severity.SKIP);
  if (active.length === 0) return severities.length > 0 ? Severity.SKIP : Severity.PASS;
  return active.reduce((worst, current) =>
    SEVERITY_PRIORITY[current] > SEVERITY_PRIORITY[worst] ? current : worst
  );
}

export function isBlocking(severity: Severity): boolean {
  return severity === Severity.FAIL || severity === Severity.ERROR;
}

export interface ValidatorResult {
  validatorName: string;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
  durationMs: number;
  evidence: string[];
}

export interface GateResult {
  gateNumber: number;
  gateName: string;
  severity: Severity;
  validatorResults: ValidatorResult[];
  durationMs: number;
  startedAt: string;
  completedAt: string;
  metadata: Record<string, unknown>;
}

export interface PipelineReport {
  pipelineId: string;
  serverTarget: string;
  gateResults: GateResult[];
  overallSeverity: Severity;
  startedAt: string;
  completedAt: string | null;
  configSnapshot: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  title?: string;
  raw: Record<string, unknown>;
}

export interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface ToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}
