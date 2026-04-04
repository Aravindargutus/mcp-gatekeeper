import { describe, it, expect } from "vitest";
import { HandshakeValidator } from "../../../src/gates/gate3-functional/validators/handshake.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

function makeCtx(connected = true, hasInit = true): ValidationContext {
  const config = PipelineConfigSchema.parse({});
  const connector = new MockConnector();
  if (connected) (connector as any)._isConnected = true;
  const ctx = new ValidationContext(connector, config.server, config);
  if (hasInit) {
    ctx.initializeResult = { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "test", version: "1.0" } };
  }
  return ctx;
}

describe("HandshakeValidator", () => {
  const validator = new HandshakeValidator();

  it("passes when connected with init result", async () => {
    const result = await validator.validate(makeCtx(true, true));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("fails when no initialize result", async () => {
    const result = await validator.validate(makeCtx(true, false));
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("fails when connection dropped", async () => {
    const result = await validator.validate(makeCtx(false, true));
    expect(result.severity).toBe(Severity.FAIL);
  });
});
