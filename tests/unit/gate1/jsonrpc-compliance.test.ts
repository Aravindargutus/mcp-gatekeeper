import { describe, it, expect } from "vitest";
import { JsonRpcComplianceValidator } from "../../../src/gates/gate1-schema/validators/jsonrpc-compliance.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";
import type { ToolDefinition } from "../../../src/core/types.js";

function makeCtx(tools: ToolDefinition[]): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const connector = new MockConnector({ tools });
  const ctx = new ValidationContext(connector, config.server, config);
  ctx.toolDefinitions = tools;
  ctx.initializeResult = { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "test", version: "1.0" } };
  return ctx;
}

describe("JsonRpcComplianceValidator", () => {
  const validator = new JsonRpcComplianceValidator();

  it("passes for well-formed tools", async () => {
    const tools: ToolDefinition[] = [{
      name: "test_tool", inputSchema: { type: "object" },
      raw: { name: "test_tool", inputSchema: { type: "object" } },
    }];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("fails when raw tool missing name", async () => {
    const tools: ToolDefinition[] = [{
      name: "test", inputSchema: { type: "object" },
      raw: { inputSchema: { type: "object" } },
    }];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("fails when no initialize result", async () => {
    const ctx = makeCtx([]);
    ctx.initializeResult = null;
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.FAIL);
  });
});
