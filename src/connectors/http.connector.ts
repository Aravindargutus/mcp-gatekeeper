import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BaseMCPConnector } from "./base.js";
import { MCPConnectionError } from "../core/errors.js";
import type {
  MCPInitializeResult,
  ToolCallResult,
  ToolDefinition,
} from "../core/types.js";

export interface HttpConnectorOptions {
  url: string;
  headers?: Record<string, string>;
  connectTimeout?: number;
  requestTimeout?: number;
  sessionId?: string;
  reconnectionOptions?: {
    maxReconnectionDelay?: number;
    initialReconnectionDelay?: number;
    reconnectionDelayGrowFactor?: number;
    maxRetries?: number;
  };
}

/**
 * Connects to MCP servers using the Streamable HTTP transport.
 * This is the modern HTTP transport — uses POST for sending and GET+SSE for receiving.
 * Supports session management, resumable streams, and OAuth.
 * Preferred for remote MCP servers over the legacy SSE transport.
 */
export class HttpConnector extends BaseMCPConnector {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(private readonly options: HttpConnectorOptions) {
    super();
  }

  async connect(): Promise<MCPInitializeResult> {
    try {
      const url = new URL(this.options.url);

      // Only pass options if we have meaningful config — empty object can cause issues
      const hasHeaders = this.options.headers && Object.keys(this.options.headers).length > 0;
      const hasSession = !!this.options.sessionId;
      const hasReconnect = !!this.options.reconnectionOptions;
      const hasOptions = hasHeaders || hasSession || hasReconnect;

      let transportOptions: Record<string, unknown> | undefined;
      if (hasOptions) {
        transportOptions = {};
        if (hasHeaders) {
          transportOptions.requestInit = { headers: this.options.headers };
        }
        if (hasSession) {
          transportOptions.sessionId = this.options.sessionId;
        }
        if (hasReconnect) {
          transportOptions.reconnectionOptions = {
            maxReconnectionDelay: this.options.reconnectionOptions!.maxReconnectionDelay ?? 30_000,
            initialReconnectionDelay: this.options.reconnectionOptions!.initialReconnectionDelay ?? 1_000,
            reconnectionDelayGrowFactor: this.options.reconnectionOptions!.reconnectionDelayGrowFactor ?? 1.5,
            maxRetries: this.options.reconnectionOptions!.maxRetries ?? 2,
          };
        }
      }

      this.transport = transportOptions
        ? new StreamableHTTPClientTransport(url, transportOptions as any)
        : new StreamableHTTPClientTransport(url);

      this.client = new Client(
        { name: "mcpqa", version: "0.1.0" },
        { capabilities: {} }
      );

      await this.client.connect(this.transport);
      this._isConnected = true;

      const serverInfo = this.client.getServerVersion();
      const capabilities = this.client.getServerCapabilities();

      return {
        protocolVersion:
          (serverInfo as Record<string, unknown>)?.protocolVersion as string ??
          "unknown",
        capabilities: (capabilities ?? {}) as Record<string, unknown>,
        serverInfo: {
          name: serverInfo?.name ?? "unknown",
          version: serverInfo?.version ?? "unknown",
        },
      };
    } catch (err) {
      throw new MCPConnectionError(
        `Failed to connect via HTTP to "${this.options.url}": ${err instanceof Error ? err.message : String(err)}`,
        "http",
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

  async listResources(): Promise<Array<Record<string, unknown>>> {
    this.ensureConnected();
    try {
      const result = await this.client!.listResources();
      return (result.resources ?? []) as unknown as Array<Record<string, unknown>>;
    } catch { return []; }
  }

  async listPrompts(): Promise<Array<Record<string, unknown>>> {
    this.ensureConnected();
    try {
      const result = await this.client!.listPrompts();
      return (result.prompts ?? []) as unknown as Array<Record<string, unknown>>;
    } catch { return []; }
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
        "http"
      );
    }
  }
}
