import { describe, it, expect } from "vitest";
import { PaginationValidator } from "../../../src/gates/gate3-functional/validators/pagination.js";
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
  return ctx;
}

describe("PaginationValidator", () => {
  const validator = new PaginationValidator();

  it("passes for tools without pagination", async () => {
    const tools: ToolDefinition[] = [
      { name: "get_user", inputSchema: { type: "object", properties: { id: { type: "string" } } }, raw: {} },
    ];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns when pagination tool has no limit param", async () => {
    const tools: ToolDefinition[] = [{
      name: "list_items",
      inputSchema: { type: "object", properties: { cursor: { type: "string" } } },
      raw: {},
    }];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("no limit"))).toBe(true);
  });

  it("passes when pagination tool has limit", async () => {
    const tools: ToolDefinition[] = [{
      name: "list_items",
      inputSchema: {
        type: "object",
        properties: { cursor: { type: "string" }, limit: { type: "integer" } },
      },
      raw: {},
    }];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.PASS);
  });
});
