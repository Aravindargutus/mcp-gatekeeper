import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { ServerTargetSchema } from "../../../core/config.js";

export class ExtensionMcpConfigValidator implements IValidator {
  readonly name = "extension-mcp-config";
  readonly description = "Validates bundled MCP server configurations in manifest";
  readonly dependencies = ["extension-manifest"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.extensionPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No extension path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const manifest = JSON.parse(readFileSync(join(ctx.extensionPath, "manifest.json"), "utf-8"));
    const mcpServers = manifest.mcpServers as Record<string, unknown> | undefined;

    if (!mcpServers || typeof mcpServers !== "object") {
      return { validatorName: this.name, severity: Severity.PASS, message: "No MCP servers bundled", details: {}, durationMs: 0, evidence: [] };
    }

    for (const [name, config] of Object.entries(mcpServers)) {
      if (!config || typeof config !== "object") {
        evidence.push(`MCP server "${name}": config is not an object`);
        continue;
      }

      const serverConfig = config as Record<string, unknown>;

      // Must have command or url
      if (!serverConfig.command && !serverConfig.url) {
        evidence.push(`MCP server "${name}": missing both 'command' and 'url' — needs one`);
      }

      // Validate structure using ServerTargetSchema
      try {
        ServerTargetSchema.parse(serverConfig);
      } catch {
        evidence.push(`MCP server "${name}": config does not match expected schema`);
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} MCP config issue(s)` : `${Object.keys(mcpServers).length} MCP server config(s) validated`,
      details: { serverCount: Object.keys(mcpServers).length },
      durationMs: 0,
      evidence,
    };
  }
}
