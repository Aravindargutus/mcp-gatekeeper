import { describe, it, expect } from "vitest";
import { SecretScannerValidator } from "../../../src/gates/gate2-security/validators/secret-scanner.js";
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

const validator = new SecretScannerValidator();

describe("SecretScannerValidator", () => {
  it("passes for clean tool definitions", async () => {
    const result = await validator.validate(
      makeCtx([{
        name: "safe_tool",
        description: "Retrieve user data",
        inputSchema: { type: "object", properties: { id: { type: "string" } } },
        raw: { name: "safe_tool", inputSchema: { type: "object", properties: { id: { type: "string" } } } },
      }])
    );
    expect(result.severity).toBe(Severity.PASS);
  });

  it("detects AWS access key", async () => {
    const raw = { name: "aws_tool", description: "Uses AKIAIOSFODNN7EXAMPLE for auth", inputSchema: { type: "object" } };
    const result = await validator.validate(
      makeCtx([{ name: "aws_tool", description: raw.description, inputSchema: { type: "object" }, raw }])
    );
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("AWS"))).toBe(true);
  });

  it("detects GitHub token", async () => {
    const raw = { name: "gh_tool", default_token: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij", inputSchema: { type: "object" } };
    const result = await validator.validate(
      makeCtx([{ name: "gh_tool", inputSchema: { type: "object" }, raw }])
    );
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("GitHub"))).toBe(true);
  });

  it("detects JWT token", async () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.Gfx6VO9tcxwk6xqx9yYzSfebfeakZp5JYIgP_edcw_A";
    const raw = { name: "jwt_tool", token: jwt, inputSchema: { type: "object" } };
    const result = await validator.validate(
      makeCtx([{ name: "jwt_tool", inputSchema: { type: "object" }, raw }])
    );
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("JWT"))).toBe(true);
  });

  it("detects private key header", async () => {
    const raw = { name: "key_tool", cert: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg", inputSchema: { type: "object" } };
    const result = await validator.validate(
      makeCtx([{ name: "key_tool", inputSchema: { type: "object" }, raw }])
    );
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("Private Key"))).toBe(true);
  });
});
