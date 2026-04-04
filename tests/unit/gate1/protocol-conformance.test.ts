import { describe, it, expect } from "vitest";
import { ProtocolConformanceValidator } from "../../../src/gates/gate1-schema/validators/protocol-conformance.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

function makeCtx(initResult?: Record<string, unknown>): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const connector = new MockConnector();
  const ctx = new ValidationContext(connector, config.server, config);
  if (initResult) {
    ctx.initializeResult = initResult as any;
  }
  return ctx;
}

describe("ProtocolConformanceValidator", () => {
  const validator = new ProtocolConformanceValidator();

  it("passes for valid initialize result", async () => {
    const ctx = makeCtx({
      protocolVersion: "2025-11-25",
      serverInfo: { name: "test-server", version: "1.0.0" },
      capabilities: { tools: { listChanged: true } },
    });
    ctx.toolDefinitions = [{ name: "tool", inputSchema: { type: "object" }, raw: {} }];
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.PASS);
  });

  it("fails when no initialize result", async () => {
    const ctx = makeCtx();
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("fails when serverInfo name is missing", async () => {
    const ctx = makeCtx({
      protocolVersion: "2025-11-25",
      serverInfo: { name: "unknown", version: "1.0.0" },
      capabilities: {},
    });
    const result = await validator.validate(ctx);
    expect(result.severity).toBe(Severity.FAIL);
  });
});
