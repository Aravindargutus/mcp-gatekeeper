import { describe, it, expect } from "vitest";
import { TimeoutValidator } from "../../../src/gates/gate3-functional/validators/timeout.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";
import type { ToolDefinition } from "../../../src/core/types.js";

function makeCtx(tools: ToolDefinition[]): ValidationContext {
  const config = PipelineConfigSchema.parse({
    gates: { 3: { validators: { timeout: { timeoutMs: 5000 } } } },
  });
  const connector = new MockConnector({ tools });
  const ctx = new ValidationContext(connector, config.server, config);
  ctx.toolDefinitions = tools;
  return ctx;
}

describe("TimeoutValidator", () => {
  const validator = new TimeoutValidator();

  it("passes for fast-responding tools", async () => {
    const tools: ToolDefinition[] = [
      { name: "fast_tool", description: "Get data quickly", inputSchema: { type: "object" }, raw: {} },
    ];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("handles tools with no required params", async () => {
    const tools: ToolDefinition[] = [
      { name: "no_params", description: "List all items", inputSchema: { type: "object" }, raw: {} },
    ];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.PASS);
  });
});
