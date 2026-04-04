import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { BaseMCPConnector } from "./base.js";
import { MCPConnectionError } from "../core/errors.js";
import type {
  MCPInitializeResult,
  ToolCallResult,
  ToolDefinition,
} from "../core/types.js";

export interface SSEConnectorOptions {
  url: string;
  connectTimeout?: number;
  requestTimeout?: number;
  headers?: Record<string, string>;
}

export class SSEConnector extends BaseMCPConnector {
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;

  constructor(private readonly options: SSEConnectorOptions) {
    super();
  }

  async connect(): Promise<MCPInitializeResult> {
    try {
      const url = new URL(this.options.url);
      this.transport = new SSEClientTransport(url);

      this.client = new Client(
        { name: "mcpqa", version: "0.1.0" },
        { capabilities: {} }
      );

      await this.client.connect(this.transport);
      this._isConnected = true;

      const serverInfo = this.client.getServerVersion();
      const capabilities = this.client.getServerCapabilities();

      return {
        protocolVersion: (serverInfo as Record<string, unknown>)?.protocolVersion as string ?? "unknown",
        capabilities: (capabilities ?? {}) as Record<string, unknown>,
        serverInfo: {
          name: serverInfo?.name ?? "unknown",
          version: serverInfo?.version ?? "unknown",
        },
      };
    } catch (err) {
      throw new MCPConnectionError(
        `Failed to connect via SSE to "${this.options.url}": ${err instanceof Error ? err.message : String(err)}`,
        "sse",
        err instanceof Error ? err : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
    } finally {
      this.client = null;
      this.transport = null;
      this._isConnected = false;
    }
  }

  async listTools(): Promise<ToolDefinition[]> {
    this.ensureConnected();
    const result = await this.client!.listTools();
    return this.mapToolDefinitions(
      (result.tools ?? []) as unknown as Array<Record<string, unknown>>
    );
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    this.ensureConnected();
    const result = await this.client!.callTool({ name, arguments: args });
    return this.mapCallToolResult(result as unknown as Record<string, unknown>);
  }

  async sendRawRequest(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    this.ensureConnected();
    return await this.client!.request(
      { method, params: params ?? {} } as any,
      {} as any
    );
  }

  private ensureConnected(): void {
    if (!this._isConnected || !this.client) {
      throw new MCPConnectionError(
        "Not connected. Call connect() first.",
        "sse"
      );
    }
  }
}
