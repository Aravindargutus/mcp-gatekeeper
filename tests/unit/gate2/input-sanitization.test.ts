import { describe, it, expect } from "vitest";
import { InputSanitizationValidator } from "../../../src/gates/gate2-security/validators/input-sanitization.js";
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

const validator = new InputSanitizationValidator();

describe("InputSanitizationValidator", () => {
  it("passes for constrained strings", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string", maxLength: 100, pattern: "^[a-z]+$" } },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });

  it("FAILS for string with zero constraints", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence).toHaveLength(1); // Single evidence, not duplicated
    expect(result.evidence[0]).toContain("ANY constraints");
  });

  it("WARNS for string with format but no maxLength", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { email: { type: "string", format: "email" } },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence).toHaveLength(1); // Only the maxLength warning
    expect(result.evidence[0]).toContain("maxLength");
  });

  it("passes for enum strings (no maxLength needed)", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { status: { type: "string", enum: ["active", "inactive"] } },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });

  it("ignores non-string types", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "tool",
        inputSchema: {
          type: "object",
          properties: { count: { type: "integer" }, active: { type: "boolean" } },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });
});
