import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class PaginationValidator implements IValidator {
  readonly name = "pagination";
  readonly description = "Tests cursor/offset pagination handling if tools return lists";
  readonly dependencies = ["handshake"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const tool of ctx.toolDefinitions) {
      const properties = tool.inputSchema?.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!properties) continue;

      const hasCursor = "cursor" in properties || "page_token" in properties || "nextCursor" in properties;
      const hasOffset = "offset" in properties || "skip" in properties;
      const hasPage = "page" in properties;
      const hasLimit = "limit" in properties || "per_page" in properties || "pageSize" in properties;

      if (hasCursor || hasOffset || hasPage) {
        if (!hasLimit) {
          evidence.push(`Tool "${tool.name}": has pagination params but no limit/per_page parameter`);
        }

        if (hasLimit) {
          const limitParam = "limit" in properties ? "limit" : "per_page" in properties ? "per_page" : "pageSize";
          try {
            const args: Record<string, unknown> = { [limitParam]: 1 };
            const required = (tool.inputSchema?.required as string[]) ?? [];
            for (const req of required) {
              if (!(req in args)) {
                args[req] = properties[req]?.default ?? "test";
              }
            }
            await ctx.connector.callTool(tool.name, args);
          } catch {
            evidence.push(`Tool "${tool.name}": pagination with limit=1 failed`);
          }
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} pagination concern(s)`
          : "Pagination handling looks correct",
      details: { issueCount: evidence.length, toolsTested: ctx.toolDefinitions.length },
      durationMs: 0,
      evidence,
    };
  }
}
