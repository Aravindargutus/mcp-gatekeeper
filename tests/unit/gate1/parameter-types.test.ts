import { describe, it, expect } from "vitest";
import { ParameterTypesValidator } from "../../../src/gates/gate1-schema/validators/parameter-types.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";
import type { ToolDefinition } from "../../../src/core/types.js";

function makeCtx(tools: ToolDefinition[]): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const ctx = new ValidationContext(new MockConnector(), config.server, config);
  ctx.toolDefinitions = tools;
  return ctx;
}

const validator = new ParameterTypesValidator();

describe("ParameterTypesValidator", () => {
  it("passes for valid parameter types", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            count: { type: "integer" },
            active: { type: "boolean" },
          },
          required: ["name"],
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });

  it("fails for invalid type", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { data: { type: "invalid_type" } },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("fails when required param missing from properties", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name", "nonexistent"],
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("nonexistent"))).toBe(true);
  });

  it("fails for array type missing items schema", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { tags: { type: "array" } },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("items"))).toBe(true);
  });

  it("fails for property without any type definition", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { mystery: {} },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("missing type"))).toBe(true);
  });

  it("passes for enum without explicit type", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { status: { enum: ["active", "inactive"] } },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });
});
