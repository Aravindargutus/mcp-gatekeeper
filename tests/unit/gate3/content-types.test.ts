import { describe, it, expect } from "vitest";
import { ContentTypesValidator } from "../../../src/gates/gate3-functional/validators/content-types.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";
import type { ToolCallResult } from "../../../src/core/types.js";

function makeCtx(invocationResults: Map<string, ToolCallResult>): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const ctx = new ValidationContext(new MockConnector(), config.server, config);
  ctx.invocationResults = invocationResults;
  return ctx;
}

describe("ContentTypesValidator", () => {
  const validator = new ContentTypesValidator();

  it("passes for valid text content", async () => {
    const results = new Map<string, ToolCallResult>([
      ["tool", { content: [{ type: "text", text: "Hello world" }] }],
    ]);
    const result = await validator.validate(makeCtx(results));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns when text content has no text field", async () => {
    const results = new Map<string, ToolCallResult>([
      ["tool", { content: [{ type: "text" }] }],
    ]);
    const result = await validator.validate(makeCtx(results));
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("missing/invalid text"))).toBe(true);
  });

  it("warns when image content has no mimeType", async () => {
    const results = new Map<string, ToolCallResult>([
      ["tool", { content: [{ type: "image", data: "base64data" }] }],
    ]);
    const result = await validator.validate(makeCtx(results));
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("mimeType"))).toBe(true);
  });

  it("warns for unknown content type", async () => {
    const results = new Map<string, ToolCallResult>([
      ["tool", { content: [{ type: "video" }] }],
    ]);
    const result = await validator.validate(makeCtx(results));
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("unknown type"))).toBe(true);
  });

  it("passes with empty invocation results", async () => {
    const result = await validator.validate(makeCtx(new Map()));
    expect(result.severity).toBe(Severity.PASS);
  });
});
