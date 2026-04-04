import { describe, it, expect } from "vitest";
import { IdempotencyValidator } from "../../../src/gates/gate3-functional/validators/idempotency.js";
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

describe("IdempotencyValidator", () => {
  const validator = new IdempotencyValidator();

  it("passes for consistent read tools", async () => {
    const tools: ToolDefinition[] = [
      { name: "get_user", description: "Get user data", inputSchema: { type: "object" }, raw: {} },
    ];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("skips write-only tools", async () => {
    const tools: ToolDefinition[] = [
      { name: "create_item", description: "Create a new item", inputSchema: { type: "object" }, raw: {} },
    ];
    const result = await validator.validate(makeCtx(tools));
    expect(result.severity).toBe(Severity.PASS);
    expect(result.details.toolsTested).toBe(0);
  });
});
