import { describe, it, expect } from "vitest";
import { DescriptionQualityValidator } from "../../../src/gates/gate1-schema/validators/description-quality.js";
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

const validator = new DescriptionQualityValidator();

describe("DescriptionQualityValidator", () => {
  it("passes for good descriptions", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "get_user",
        description: "Retrieve a user by their unique identifier and return profile information.",
        inputSchema: { type: "object", properties: { id: { type: "string", description: "User ID" } } },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns on missing description", async () => {
    const result = await validator.validate(
      makeCtx([{ name: "no_desc", inputSchema: { type: "object" }, raw: {} }])
    );
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("missing"))).toBe(true);
  });

  it("warns on short description", async () => {
    const result = await validator.validate(
      makeCtx([{ name: "short", description: "Does stuff", inputSchema: { type: "object" }, raw: {} }])
    );
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("too short"))).toBe(true);
  });

  it("warns on placeholder text", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "placeholder",
        description: "TODO: add description here for this tool",
        inputSchema: { type: "object" },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("placeholder"))).toBe(true);
  });

  it("warns on missing action verb", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "no_verb",
        description: "This is a tool that does something with data for users and other entities.",
        inputSchema: { type: "object" },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("action verb"))).toBe(true);
  });

  it("warns on undocumented parameters", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "undoc_params",
        description: "Retrieve items from the database based on provided criteria.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("no description"))).toBe(true);
  });
});
