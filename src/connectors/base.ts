import type { IMCPConnector } from "../core/interfaces.js";
import type {
  MCPInitializeResult,
  ToolCallResult,
  ToolDefinition,
} from "../core/types.js";

export abstract class BaseMCPConnector implements IMCPConnector {
  protected _isConnected = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  abstract connect(): Promise<MCPInitializeResult>;
  abstract disconnect(): Promise<void>;
  abstract listTools(): Promise<ToolDefinition[]>;
  abstract callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult>;
  abstract sendRawRequest(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown>;

  /** Shared mapping from SDK tool objects to our ToolDefinition type. */
  protected mapToolDefinitions(tools: Array<Record<string, unknown>>): ToolDefinition[] {
    return tools.map((tool) => ({
      name: tool.name as string,
      description: tool.description as string | undefined,
      inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
      outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
      annotations: tool.annotations as Record<string, unknown> | undefined,
      title: tool.title as string | undefined,
      raw: tool,
    }));
  }

  /** Shared mapping from SDK callTool result to our ToolCallResult type. */
  protected mapCallToolResult(result: Record<string, unknown>): ToolCallResult {
    return {
      content: ((result.content ?? []) as Array<Record<string, unknown>>).map((c) => ({
        type: c.type as string,
        text: c.text as string | undefined,
        data: c.data as string | undefined,
        mimeType: c.mimeType as string | undefined,
        ...c,
      })),
      isError: result.isError as boolean | undefined,
      structuredContent: result.structuredContent as Record<string, unknown> | undefined,
    };
  }
}
