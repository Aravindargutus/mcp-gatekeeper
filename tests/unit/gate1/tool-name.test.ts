import { describe, it, expect } from "vitest";
import { ToolNameValidator } from "../../../src/gates/gate1-schema/validators/tool-name.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";
import type { ToolDefinition } from "../../../src/core/types.js";
import validTools from "../../fixtures/valid-tools.json";
import invalidTools from "../../fixtures/invalid-tools.json";

function makeContext(tools: ToolDefinition[]): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const connector = new MockConnector({ tools });
  const ctx = new ValidationContext(connector, config.server, config);
  ctx.toolDefinitions = tools;
  return ctx;
}

function toToolDef(raw: Record<string, unknown>): ToolDefinition {
  return {
    name: raw.name as string,
    description: raw.description as string | undefined,
    inputSchema: (raw.inputSchema ?? {}) as Record<string, unknown>,
    raw,
  };
}

describe("ToolNameValidator", () => {
  const validator = new ToolNameValidator();

  it("passes for valid tool names", async () => {
    const tools = (validTools as Record<string, unknown>[]).map(toToolDef);
    const ctx = makeContext(tools);
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.PASS);
    expect(result.evidence).toHaveLength(0);
  });

  it("fails for tool names with spaces", async () => {
    const tools = [toToolDef({ name: "tool with spaces", inputSchema: { type: "object" } })];
    const ctx = makeContext(tools);
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("fails for empty tool names", async () => {
    const tools = [toToolDef({ name: "", inputSchema: { type: "object" } })];
    const ctx = makeContext(tools);
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("detects duplicate tool names", async () => {
    const tools = [
      toToolDef({ name: "my_tool", inputSchema: { type: "object" } }),
      toToolDef({ name: "my_tool", inputSchema: { type: "object" } }),
    ];
    const ctx = makeContext(tools);
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("warns when no tools found", async () => {
    const ctx = makeContext([]);
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.WARN);
  });

  it("accepts valid special characters in names", async () => {
    const tools = [
      toToolDef({ name: "my.tool-v2_test", inputSchema: { type: "object" } }),
    ];
    const ctx = makeContext(tools);
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.PASS);
  });
});
