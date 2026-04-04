import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

const WRITE_KEYWORDS = /\b(write|create|update|modify|put|patch|post|insert|add|set|save|store)\b/i;
const DELETE_KEYWORDS = /\b(delete|remove|drop|destroy|purge|erase|clear|wipe|truncate)\b/i;
const READ_KEYWORDS = /\b(read|get|list|fetch|retrieve|search|find|query|show|view)\b/i;
const FILESYSTEM_KEYWORDS = /\b(file|path|directory|folder|disk|filesystem|fs)\b/i;
const NETWORK_KEYWORDS = /\b(url|http|api|endpoint|request|fetch|download|upload|send|socket|webhook)\b/i;
const ADMIN_KEYWORDS = /\b(admin|root|sudo|superuser|privilege|permission|access|role|credential|config(uration)?)\b/i;

export class PermissionScopeValidator implements IValidator {
  readonly name = "permission-scope";
  readonly description = "Analyzes tool annotations for excessive or dangerous permission combinations";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    // Categorize tools by their implied capabilities
    const toolCategories = ctx.toolDefinitions.map((tool) => {
      const text = `${tool.name} ${tool.description ?? ""} ${JSON.stringify(tool.inputSchema)}`;
      return {
        name: tool.name,
        canWrite: WRITE_KEYWORDS.test(text),
        canDelete: DELETE_KEYWORDS.test(text),
        canRead: READ_KEYWORDS.test(text),
        touchesFilesystem: FILESYSTEM_KEYWORDS.test(text),
        touchesNetwork: NETWORK_KEYWORDS.test(text),
        hasAdminScope: ADMIN_KEYWORDS.test(text),
      };
    });

    // Check for dangerous combinations
    for (const tool of toolCategories) {
      // Write + Delete on same tool = destructive
      if (tool.canWrite && tool.canDelete) {
        evidence.push(
          `Tool "${tool.name}": has both write AND delete capabilities — high risk`
        );
      }

      // Filesystem + Network = potential exfiltration path
      if (tool.touchesFilesystem && tool.touchesNetwork) {
        evidence.push(
          `Tool "${tool.name}": accesses both filesystem AND network — potential data exfiltration path`
        );
      }

      // Admin scope tools
      if (tool.hasAdminScope && (tool.canWrite || tool.canDelete)) {
        evidence.push(
          `Tool "${tool.name}": has admin-level scope with write/delete capability — high privilege`
        );
      }
    }

    // Server-level: check if too many destructive tools
    const destructiveTools = toolCategories.filter((t) => t.canDelete);
    if (destructiveTools.length > 3) {
      evidence.push(
        `Server exposes ${destructiveTools.length} destructive (delete) tools — consider reducing scope`
      );
    }

    // Check for tools with no read-only options (all tools are write/delete)
    const readOnlyTools = toolCategories.filter(
      (t) => t.canRead && !t.canWrite && !t.canDelete
    );
    if (readOnlyTools.length === 0 && ctx.toolDefinitions.length > 0) {
      evidence.push(
        "Server has no read-only tools — all tools have write/delete capabilities"
      );
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} permission scope concern(s) found`
          : "Permission scopes look reasonable",
      details: {
        totalTools: ctx.toolDefinitions.length,
        readOnly: readOnlyTools.length,
        destructive: destructiveTools.length,
      },
      durationMs: 0,
      evidence,
    };
  }
}
