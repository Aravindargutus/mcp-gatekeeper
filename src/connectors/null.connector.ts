import { BaseMCPConnector } from "./base.js";
import type {
  MCPInitializeResult,
  ToolCallResult,
  ToolDefinition,
} from "../core/types.js";

/**
 * NullConnector — a no-op connector for file-based gates (Skills, Extensions).
 * Connects successfully but returns empty tools. Used when the pipeline
 * only needs to run gates that read local files, not MCP servers.
 */
export class NullConnector extends BaseMCPConnector {
  async connect(): Promise<MCPInitializeResult> {
    this._isConnected = true;
    return {
      protocolVersion: "2025-11-25",
      capabilities: {},
      serverInfo: { name: "null", version: "0.0.0" },
    };
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
  }

  async listTools(): Promise<ToolDefinition[]> {
    return [];
  }

  async callTool(name: string, _args: Record<string, unknown>): Promise<ToolCallResult> {
    return {
      content: [{ type: "text", text: `NullConnector: tool "${name}" not available` }],
      isError: true,
    };
  }

  async sendRawRequest(_method: string, _params?: Record<string, unknown>): Promise<unknown> {
    return { jsonrpc: "2.0", result: {} };
  }
}
