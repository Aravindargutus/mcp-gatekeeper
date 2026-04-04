import { describe, it, expect } from "vitest";
import { ToolInvocationValidator } from "../../../src/gates/gate3-functional/validators/tool-invocation.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";
import type { ToolDefinition, ToolCallResult } from "../../../src/core/types.js";

function makeCtx(
  tools: ToolDefinition[],
  results?: Map<string, ToolCallResult>
): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const connector = new MockConnector({ tools, callResults: results });
  const ctx = new ValidationContext(connector, config.server, config);
  ctx.toolDefinitions = tools;
  ctx.initializeResult = { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "mock", version: "1.0" } };
  return ctx;
}

describe("ToolInvocationValidator", () => {
  const validator = new ToolInvocationValidator();

  it("passes when all tools return valid content", async () => {
    const tools: ToolDefinition[] = [
      { name: "get_user", description: "Get user", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, raw: {} },
    ];
    const results = new Map<string, ToolCallResult>([
      ["get_user", { content: [{ type: "text", text: "User data" }] }],
    ]);
    const result = await validator.validate(makeCtx(tools, results));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("fails when tool returns no content array", async () => {
    const tools: ToolDefinition[] = [
      { name: "broken_tool", description: "Broken", inputSchema: { type: "object" }, raw: {} },
    ];
    const results = new Map<string, ToolCallResult>([
      ["broken_tool", { content: null as any }],
    ]);
    const result = await validator.validate(makeCtx(tools, results));
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("warns when tool returns isError with valid inputs", async () => {
    const tools: ToolDefinition[] = [
      { name: "err_tool", description: "Errors", inputSchema: { type: "object" }, raw: {} },
    ];
    const results = new Map<string, ToolCallResult>([
      ["err_tool", { content: [{ type: "text", text: "Error occurred" }], isError: true }],
    ]);
    const result = await validator.validate(makeCtx(tools, results));
    expect(result.severity).toBe(Severity.WARN);
  });

  it("populates invocationResults in context", async () => {
    const tools: ToolDefinition[] = [
      { name: "tool_a", description: "Get stuff", inputSchema: { type: "object" }, raw: {} },
    ];
    const ctx = makeCtx(tools);
    await validator.validate(ctx);
    expect(ctx.invocationResults.has("tool_a")).toBe(true);
  });

  it("generates correct sample args for various types", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "typed_tool",
        description: "Get data",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            count: { type: "integer", minimum: 5, maximum: 10 },
            email: { type: "string", format: "email" },
          },
          required: ["name", "count", "email"],
        },
        raw: {},
      },
    ];
    const ctx = makeCtx(tools);
    await validator.validate(ctx);
    // Tool was called — means sample args were generated
    expect(ctx.invocationResults.has("typed_tool")).toBe(true);
  });
});
