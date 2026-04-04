import { describe, it, expect } from "vitest";
import { ErrorFormatValidator } from "../../../src/gates/gate3-functional/validators/error-format.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

function makeCtx(errorResponses: Map<string, unknown>): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const connector = new MockConnector();
  const ctx = new ValidationContext(connector, config.server, config);
  ctx.errorResponses = errorResponses;
  return ctx;
}

describe("ErrorFormatValidator", () => {
  const validator = new ErrorFormatValidator();

  it("passes or warns with well-formatted errors (mock accepts nonexistent tool)", async () => {
    const errors = new Map<string, unknown>([
      ["tool:empty", { isError: true, content: [{ type: "text", text: "Missing required parameter: id" }] }],
    ]);
    const result = await validator.validate(makeCtx(errors));
    // MockConnector doesn't throw on nonexistent tool, so always produces a warn for that test.
    // The actual error format entries should be fine.
    expect(result.evidence.some((e) => e.includes("non-existent tool"))).toBe(true);
    // The actual error responses are well-formatted — no "no content" or "lacks text" evidence
    expect(result.evidence.some((e) => e.includes("no content"))).toBe(false);
  });

  it("warns when error has isError but no content", async () => {
    const errors = new Map<string, unknown>([
      ["tool:empty", { isError: true, content: [] }],
    ]);
    const result = await validator.validate(makeCtx(errors));
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("no content"))).toBe(true);
  });

  it("warns when error content lacks text", async () => {
    const errors = new Map<string, unknown>([
      ["tool:empty", { isError: true, content: [{ type: "image", data: "abc" }] }],
    ]);
    const result = await validator.validate(makeCtx(errors));
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("lacks descriptive text"))).toBe(true);
  });
});
