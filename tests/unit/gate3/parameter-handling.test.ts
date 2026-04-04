import { describe, it, expect } from "vitest";
import { ParameterHandlingValidator } from "../../../src/gates/gate3-functional/validators/parameter-handling.js";
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

describe("ParameterHandlingValidator", () => {
  const validator = new ParameterHandlingValidator();

  it("passes when tools work with required params only", async () => {
    const tools: ToolDefinition[] = [{
      name: "tool",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, verbose: { type: "boolean" } },
        required: ["id"],
      },
      raw: {},
    }];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("handles tools with no optional params", async () => {
    const tools: ToolDefinition[] = [{
      name: "tool",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      raw: {},
    }];
    const result = await validator.validate(makeCtx(tools));
    // No optional params = no test to run = pass
    expect(result.severity).toBe(Severity.PASS);
  });
});
