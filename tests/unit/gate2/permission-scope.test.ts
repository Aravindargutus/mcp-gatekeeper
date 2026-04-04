import { describe, it, expect } from "vitest";
import { PermissionScopeValidator } from "../../../src/gates/gate2-security/validators/permission-scope.js";
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

const validator = new PermissionScopeValidator();

describe("PermissionScopeValidator", () => {
  it("passes for read-only tools", async () => {
    const result = await validator.validate(
      makeCtx([
        { name: "get_user", description: "Get user data by ID", inputSchema: { type: "object" }, raw: {} },
        { name: "list_items", description: "List items in collection", inputSchema: { type: "object" }, raw: {} },
      ])
    );
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns on write+delete combo", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "manage_records",
        description: "Create, update, and delete records in the database",
        inputSchema: { type: "object" },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("write AND delete"))).toBe(true);
  });

  it("warns on filesystem+network combo", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "sync_files",
        description: "Upload files from local directory to remote URL endpoint",
        inputSchema: { type: "object" },
        raw: {},
      }])
    );
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("exfiltration"))).toBe(true);
  });

  it("warns when server has no read-only tools", async () => {
    const result = await validator.validate(
      makeCtx([
        { name: "create_item", description: "Create a new item", inputSchema: { type: "object" }, raw: {} },
        { name: "delete_item", description: "Delete an item", inputSchema: { type: "object" }, raw: {} },
      ])
    );
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("no read-only"))).toBe(true);
  });
});
