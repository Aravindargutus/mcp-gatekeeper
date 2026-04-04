import { BaseMCPConnector } from "./base.js";
import type {
  MCPInitializeResult,
  ToolCallResult,
  ToolDefinition,
} from "../core/types.js";

export interface MockConnectorOptions {
  tools?: ToolDefinition[];
  callResults?: Map<string, ToolCallResult>;
  initializeResult?: Partial<MCPInitializeResult>;
  shouldFailConnect?: boolean;
  shouldFailListTools?: boolean;
}

export class MockConnector extends BaseMCPConnector {
  constructor(private readonly options: MockConnectorOptions = {}) {
    super();
  }

  async connect(): Promise<MCPInitializeResult> {
    if (this.options.shouldFailConnect) {
      throw new Error("Mock connection failure");
    }
    this._isConnected = true;
    return {
      protocolVersion: "2025-11-25",
      capabilities: {
        tools: { listChanged: true },
      },
      serverInfo: {
        name: "mock-server",
        version: "1.0.0",
      },
      ...this.options.initializeResult,
    };
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
  }

  async listTools(): Promise<ToolDefinition[]> {
    if (this.options.shouldFailListTools) {
      throw new Error("Mock listTools failure");
    }
    return this.options.tools ?? [];
  }

  async callTool(
    name: string,
    _args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    const result = this.options.callResults?.get(name);
    if (result) return result;
    return {
      content: [{ type: "text", text: `Mock result for ${name}` }],
      isError: false,
    };
  }

  async sendRawRequest(
    _method: string,
    _params?: Record<string, unknown>
  ): Promise<unknown> {
    return { jsonrpc: "2.0", result: {} };
  }
}
