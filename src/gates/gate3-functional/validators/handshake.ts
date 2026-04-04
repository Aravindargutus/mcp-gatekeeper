import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class HandshakeValidator implements IValidator {
  readonly name = "handshake";
  readonly description = "Verifies initialize → initialized flow and capabilities exchange";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    if (!ctx.initializeResult) {
      return {
        validatorName: this.name,
        severity: Severity.FAIL,
        message: "Server handshake failed — no initialize result",
        details: {},
        durationMs: 0,
        evidence: ["initialize handshake did not complete"],
      };
    }

    // Verify connection is still alive
    if (!ctx.connector.isConnected) {
      evidence.push("Connection dropped after initialize");
      return {
        validatorName: this.name,
        severity: Severity.FAIL,
        message: "Connection lost after handshake",
        details: {},
        durationMs: 0,
        evidence,
      };
    }

    // Verify tools can be listed (functional check)
    try {
      const tools = await ctx.connector.listTools();
      if (!Array.isArray(tools)) {
        evidence.push("listTools did not return an array");
      }
    } catch (err) {
      evidence.push(
        `listTools failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.FAIL : Severity.PASS,
      message: evidence.length > 0
        ? "Handshake issues detected"
        : "Server handshake and capabilities exchange successful",
      details: {
        protocolVersion: ctx.initializeResult.protocolVersion,
        serverName: ctx.initializeResult.serverInfo?.name,
      },
      durationMs: 0,
      evidence,
    };
  }
}
