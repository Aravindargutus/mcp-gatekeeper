import { describe, it, expect } from "vitest";
import { RateLimitValidator } from "../../../src/gates/gate2-security/validators/rate-limit.js";
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

describe("RateLimitValidator", () => {
  const validator = new RateLimitValidator();

  it("passes for read-only tools", async () => {
    const result = await validator.validate(
      makeCtx([{ name: "get_data", description: "Fetch data from store", inputSchema: { type: "object" }, raw: {} }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns for write tools without rate limit info", async () => {
    const result = await validator.validate(
      makeCtx([{ name: "create_item", description: "Create a new item in the collection", inputSchema: { type: "object" }, raw: {} }])
    );
    expect(result.severity).toBe(Severity.WARN);
  });

  it("passes for write tools with rate limit in description", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "send_email",
        description: "Send an email. Rate limited to 100 requests per minute.",
        inputSchema: { type: "object" },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });
});
