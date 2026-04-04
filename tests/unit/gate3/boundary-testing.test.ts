import { describe, it, expect } from "vitest";
import { BoundaryTestingValidator } from "../../../src/gates/gate3-functional/validators/boundary-testing.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";
import type { ToolDefinition, ToolCallResult } from "../../../src/core/types.js";

function makeCtx(tools: ToolDefinition[], callResults?: Map<string, ToolCallResult>): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const connector = new MockConnector({ tools, callResults });
  const ctx = new ValidationContext(connector, config.server, config);
  ctx.toolDefinitions = tools;
  return ctx;
}

describe("BoundaryTestingValidator", () => {
  const validator = new BoundaryTestingValidator();

  it("passes when tools reject invalid input", async () => {
    const tools: ToolDefinition[] = [{
      name: "tool", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, raw: {},
    }];
    const results = new Map<string, ToolCallResult>([
      ["tool", { content: [{ type: "text", text: "error" }], isError: true }],
    ]);
    const result = await validator.validate(makeCtx(tools, results));
    // MockConnector returns isError: true for the tool, empty args call will also get mock response
    expect([Severity.PASS, Severity.WARN]).toContain(result.severity);
  });

  it("fails when tools accept empty args despite required params", async () => {
    const tools: ToolDefinition[] = [{
      name: "bad_tool", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, raw: {},
    }];
    // MockConnector returns isError: false by default (simulating the Zoho bug)
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("accepted empty args"))).toBe(true);
  });

  it("handles tools with no required params gracefully", async () => {
    const tools: ToolDefinition[] = [{
      name: "optional_tool", inputSchema: { type: "object", properties: { q: { type: "string" } } }, raw: {},
    }];
    const result = await validator.validate(makeCtx(tools));
    // No required params = no empty-args or wrong-type tests, but oversized string test still runs
    // MockConnector doesn't return isError, so oversized test produces a warn
    expect([Severity.PASS, Severity.WARN]).toContain(result.severity);
  });
});
