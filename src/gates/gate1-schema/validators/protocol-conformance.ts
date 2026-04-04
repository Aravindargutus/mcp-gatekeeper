import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class ProtocolConformanceValidator implements IValidator {
  readonly name = "protocol-conformance";
  readonly description = "Validates server responded correctly to initialize with proper capabilities";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let hasFail = false;

    const init = ctx.initializeResult;

    if (!init) {
      return {
        validatorName: this.name,
        severity: Severity.FAIL,
        message: "No initialize result available — server did not respond to handshake",
        details: {},
        durationMs: 0,
        evidence: ["initialize handshake failed or was not performed"],
      };
    }

    // Check protocol version — if connection succeeded via SDK, protocol was negotiated.
    // "unknown" just means the SDK doesn't expose it via getServerVersion().
    if (!init.protocolVersion || init.protocolVersion === "unknown") {
      if (ctx.connector.isConnected) {
        // Connection succeeded, so protocol was negotiated — this is informational, not a failure
        evidence.push("Protocol version not exposed by SDK, but connection succeeded (protocol negotiated internally)");
      } else {
        evidence.push("Server did not report a protocol version and connection is not active");
        hasFail = true;
      }
    }

    // Check server info
    if (!init.serverInfo) {
      evidence.push("Server did not provide serverInfo");
      hasFail = true;
    } else {
      if (!init.serverInfo.name || init.serverInfo.name === "unknown") {
        evidence.push("Server name is missing or unknown");
        hasFail = true;
      }
      if (!init.serverInfo.version || init.serverInfo.version === "unknown") {
        evidence.push("Server version is missing or unknown");
        hasFail = true;
      }
    }

    // Check capabilities object exists
    if (!init.capabilities || typeof init.capabilities !== "object") {
      evidence.push("Server did not provide capabilities object");
      hasFail = true;
    }

    // If server has tools capability, verify tools can be listed
    if (init.capabilities?.tools) {
      if (ctx.toolDefinitions.length === 0) {
        evidence.push(
          "Server declares tools capability but returned 0 tools"
        );
        // This is a warning, not a failure — server might legitimately have no tools
      }
    }

    return {
      validatorName: this.name,
      severity: hasFail ? Severity.FAIL : Severity.PASS,
      message: hasFail
        ? `Protocol conformance issues found`
        : `Server conforms to MCP protocol (version: ${init.protocolVersion}, server: ${init.serverInfo?.name}@${init.serverInfo?.version})`,
      details: {
        protocolVersion: init.protocolVersion,
        serverName: init.serverInfo?.name,
        serverVersion: init.serverInfo?.version,
        hasToolsCapability: !!init.capabilities?.tools,
        toolCount: ctx.toolDefinitions.length,
      },
      durationMs: 0,
      evidence,
    };
  }
}
