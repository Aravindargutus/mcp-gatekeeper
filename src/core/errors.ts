export class MCPQAError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "MCPQAError";
  }
}

export class GateFailedError extends MCPQAError {
  constructor(
    public readonly gateNumber: number,
    public readonly gateName: string,
    message: string
  ) {
    super(message, "GATE_FAILED");
    this.name = "GateFailedError";
  }
}

export class MCPConnectionError extends MCPQAError {
  constructor(
    message: string,
    public readonly transport: "stdio" | "sse" | "http" | "mock",
    public readonly cause?: Error
  ) {
    super(message, "MCP_CONNECTION_ERROR");
    this.name = "MCPConnectionError";
  }
}

export class ConfigError extends MCPQAError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

export class ValidatorError extends MCPQAError {
  constructor(
    public readonly validatorName: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(message, "VALIDATOR_ERROR");
    this.name = "ValidatorError";
  }
}
