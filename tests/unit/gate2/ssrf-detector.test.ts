import { describe, it, expect } from "vitest";
import { SSRFDetectorValidator } from "../../../src/gates/gate2-security/validators/ssrf-detector.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";
import type { ToolDefinition } from "../../../src/core/types.js";

function makeContext(tools: ToolDefinition[]): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const connector = new MockConnector({ tools });
  const ctx = new ValidationContext(connector, config.server, config);
  ctx.toolDefinitions = tools;
  return ctx;
}

describe("SSRFDetectorValidator", () => {
  const validator = new SSRFDetectorValidator();

  it("passes for tools without URL params", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "safe_tool",
        description: "Get user data by ID",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "User ID", maxLength: 64 },
          },
        },
        raw: {},
      },
    ];
    const result = await validator.validate(makeContext(tools));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("detects cloud metadata endpoint in defaults", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "ssrf_tool",
        description: "Fetch data from URL",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              format: "uri",
              description: "URL to fetch",
              default: "http://169.254.169.254/latest/meta-data/",
            },
          },
        },
        raw: {},
      },
    ];
    const result = await validator.validate(makeContext(tools));
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("169.254.169.254"))).toBe(true);
  });

  it("flags URL params without pattern restriction", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "unrestricted_url",
        description: "Fetch data from any URL",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              format: "uri",
              description: "Any URL",
            },
          },
        },
        raw: {},
      },
    ];
    const result = await validator.validate(makeContext(tools));
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("SSRF risk"))).toBe(true);
  });

  it("detects file:// scheme in parameter defaults", async () => {
    const tools: ToolDefinition[] = [
      {
        name: "file_scheme",
        description: "Read from a file path",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              format: "uri",
              description: "File path to read",
              default: "file:///etc/passwd",
            },
          },
        },
        raw: {},
      },
    ];
    const result = await validator.validate(makeContext(tools));
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("file://"))).toBe(true);
  });
});
