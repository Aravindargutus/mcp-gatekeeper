import { describe, it, expect } from "vitest";
import { AuthCheckValidator } from "../../../src/gates/gate2-security/validators/auth-check.js";
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

describe("AuthCheckValidator", () => {
  const validator = new AuthCheckValidator();

  it("passes for read-only tools", async () => {
    const result = await validator.validate(
      makeCtx([{ name: "get_data", description: "Retrieve data", inputSchema: { type: "object" }, raw: {} }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns for write tools without auth info", async () => {
    const result = await validator.validate(
      makeCtx([{ name: "delete_item", description: "Delete an item from storage", inputSchema: { type: "object" }, raw: {} }])
    );
    expect(result.severity).toBe(Severity.WARN);
  });

  it("passes for write tools with auth in description", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "create_user",
        description: "Create a new user. Requires authentication with OAuth token.",
        inputSchema: { type: "object" },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });
});
