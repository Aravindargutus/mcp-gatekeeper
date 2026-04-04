import { describe, it, expect } from "vitest";
import { ToolSchemaValidator } from "../../../src/gates/gate1-schema/validators/tool-schema.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";
import type { ToolDefinition } from "../../../src/core/types.js";

function makeContext(tools: ToolDefinition[]): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const connector = new MockConnector({ tools });
  const ctx = new ValidationContext(connector, config.server, config);
  ctx.toolDefinitions = tools;
  return ctx;
}

describe("ToolSchemaValidator", () => {
  const validator = new ToolSchemaValidator();

  it("passes for valid JSON Schema", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "test_tool",
        description: "A test tool that does things",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "The name" },
          },
          required: ["name"],
        },
        raw: {},
      },
    ];
    const result = await validator.validate(makeContext(tools));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("fails when inputSchema is missing", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "no_schema",
        description: "Missing schema tool",
        inputSchema: undefined as unknown as Record<string, unknown>,
        raw: {},
      },
    ];
    const result = await validator.validate(makeContext(tools));
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("fails when inputSchema.type is not object", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "bad_type",
        description: "Schema with wrong root type",
        inputSchema: { type: "string" },
        raw: {},
      },
    ];
    const result = await validator.validate(makeContext(tools));
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes('should be "object"'))).toBe(true);
  });

  it("validates outputSchema when present", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "with_output",
        description: "Has valid output schema",
        inputSchema: { type: "object" },
        outputSchema: { type: "object", properties: { result: { type: "string" } } },
        raw: {},
      },
    ];
    const result = await validator.validate(makeContext(tools));
    expect(result.severity).toBe(Severity.PASS);
  });
});
