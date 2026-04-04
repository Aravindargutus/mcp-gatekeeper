import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class ServerJsonValidator implements IValidator {
  readonly name = "server-json";
  readonly description = "Validates server.json for MCP Registry submission (tool definitions, transport config)";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.packagePath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No package path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const serverJsonPath = join(ctx.packagePath, "server.json");

    if (!existsSync(serverJsonPath)) {
      return {
        validatorName: this.name, severity: Severity.WARN,
        message: "No server.json — won't be submittable to the MCP Registry",
        details: {}, durationMs: 0,
        evidence: ["Missing server.json (required by mcp-publisher for registry submission)"],
      };
    }

    let serverJson: Record<string, unknown>;
    try {
      serverJson = JSON.parse(readFileSync(serverJsonPath, "utf-8"));
    } catch (err) {
      return {
        validatorName: this.name, severity: Severity.FAIL,
        message: "server.json is not valid JSON", details: {},
        durationMs: 0, evidence: [`Parse error: ${err instanceof Error ? err.message : String(err)}`],
      };
    }

    // Required fields for MCP Registry
    if (!serverJson.name) evidence.push("Missing 'name' field");
    if (!serverJson.description) evidence.push("Missing 'description' field");
    if (!serverJson.version) evidence.push("Missing 'version' field");

    // Tools list
    const tools = serverJson.tools as Array<Record<string, unknown>> | undefined;
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      evidence.push("No 'tools' array — registry listing will show no tools");
    } else {
      for (const tool of tools) {
        if (!tool.name) evidence.push(`Tool missing 'name' field in server.json`);
        if (!tool.description) evidence.push(`Tool "${tool.name ?? "unknown"}": missing 'description'`);
      }
    }

    // Transport config
    const transport = serverJson.transport as Record<string, unknown> | undefined;
    if (!transport) {
      evidence.push("No 'transport' config — clients won't know how to connect");
    } else {
      if (!transport.stdio && !transport.sse && !transport.http) {
        evidence.push("Transport config has no stdio/sse/http entry");
      }
      if (transport.stdio) {
        const stdio = transport.stdio as Record<string, unknown>;
        if (!stdio.command) evidence.push("stdio transport missing 'command'");
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} server.json concern(s)` : "server.json is ready for MCP Registry",
      details: { toolCount: tools?.length ?? 0 },
      durationMs: 0,
      evidence,
    };
  }
}
