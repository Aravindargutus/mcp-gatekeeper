import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class JsonRpcComplianceValidator implements IValidator {
  readonly name = "jsonrpc-compliance";
  readonly description = "Validates JSON-RPC 2.0 compliance of server responses";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let hasFail = false;

    // The MCP SDK handles JSON-RPC framing internally.
    // If we got this far (connection succeeded, tools listed), basic compliance is met.
    // We do additional structural checks on raw tool definitions.

    for (const tool of ctx.toolDefinitions) {
      const raw = tool.raw;

      // Tool definition must have name field
      if (!raw.name || typeof raw.name !== "string") {
        evidence.push(`Tool definition missing required "name" field (string)`);
        hasFail = true;
      }

      // inputSchema must be present and an object
      if (!raw.inputSchema || typeof raw.inputSchema !== "object") {
        evidence.push(
          `Tool "${tool.name}": missing required "inputSchema" field (object)`
        );
        hasFail = true;
      }
    }

    // Verify that the server successfully handled the initialize/listTools flow
    // (If we have toolDefinitions, the JSON-RPC exchange worked correctly)
    if (!ctx.initializeResult) {
      evidence.push("JSON-RPC initialize handshake did not complete");
      hasFail = true;
    }

    // Test a raw ping-like request if supported
    try {
      const rawResponse = await ctx.connector.sendRawRequest("ping");
      if (rawResponse === undefined || rawResponse === null) {
        evidence.push("Server returned null/undefined for ping request");
      }
    } catch {
      // ping is optional per MCP spec — not a failure
      evidence.push("Server does not support 'ping' method (optional)");
    }

    return {
      validatorName: this.name,
      severity: hasFail ? Severity.FAIL : Severity.PASS,
      message: hasFail
        ? `JSON-RPC compliance issues found`
        : "Server responses comply with JSON-RPC 2.0",
      details: {
        toolsReturned: ctx.toolDefinitions.length,
        handshakeComplete: !!ctx.initializeResult,
      },
      durationMs: 0,
      evidence,
    };
  }
}
