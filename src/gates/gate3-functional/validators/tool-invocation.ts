import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { mapWithConcurrency } from "../../../utils/concurrency.js";
import { logger } from "../../../utils/logger.js";

const CONCURRENCY = 10;

export class ToolInvocationValidator implements IValidator {
  readonly name = "tool-invocation";
  readonly description = "Calls each tool with valid sample inputs and verifies responses (parallel)";
  readonly dependencies = ["handshake"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let failCount = 0;

    logger.debug(`Invoking ${ctx.toolDefinitions.length} tools (concurrency: ${CONCURRENCY})`);

    const results = await mapWithConcurrency(
      ctx.toolDefinitions,
      CONCURRENCY,
      async (tool) => {
        const sampleArgs = this.generateSampleArgs(tool.inputSchema);
        const result = await ctx.connector.callTool(tool.name, sampleArgs);
        return { tool, result };
      }
    );

    for (const r of results) {
      if (r.error) {
        evidence.push(`Tool "${r.item.name}": invocation threw: ${r.error instanceof Error ? (r.error as Error).message : String(r.error)}`);
        failCount++;
        continue;
      }

      const { tool, result } = r.result!;
      ctx.invocationResults.set(tool.name, result);

      if (!result.content || !Array.isArray(result.content)) {
        evidence.push(`Tool "${tool.name}": response missing 'content' array`);
        failCount++;
        continue;
      }

      for (let i = 0; i < result.content.length; i++) {
        if (!result.content[i].type) {
          evidence.push(`Tool "${tool.name}": content[${i}] missing 'type' field`);
          failCount++;
        }
      }

      if (result.isError) {
        evidence.push(`Tool "${tool.name}": returned isError=true with valid sample inputs`);
      }
    }

    return {
      validatorName: this.name,
      severity: failCount > 0 ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        failCount > 0
          ? `${failCount} tool(s) failed invocation`
          : evidence.length > 0
            ? `All tools invoked but ${evidence.length} warning(s)`
            : `All ${ctx.toolDefinitions.length} tools invoked successfully`,
      details: { toolCount: ctx.toolDefinitions.length, failCount, warnCount: evidence.length - failCount },
      durationMs: 0,
      evidence,
      partialCredit: ctx.toolDefinitions.length > 0
        ? (ctx.toolDefinitions.length - failCount) / ctx.toolDefinitions.length
        : 0,
    };
  }

  private generateSampleArgs(schema: Record<string, unknown>): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    const required = (schema.required as string[]) ?? [];
    if (!properties) return args;

    for (const paramName of required) {
      const paramSchema = properties[paramName];
      if (!paramSchema) continue;
      args[paramName] = this.generateValue(paramSchema);
    }
    return args;
  }

  private generateValue(schema: Record<string, unknown>): unknown {
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
    if (schema.const !== undefined) return schema.const;

    switch (schema.type) {
      case "string":
        if (schema.format === "date") return "2024-01-01";
        if (schema.format === "date-time") return "2024-01-01T00:00:00Z";
        if (schema.format === "email") return "test@example.com";
        if (schema.format === "uri") return "https://example.com";
        return "test";
      case "number":
      case "integer": {
        const min = typeof schema.minimum === "number" ? schema.minimum : undefined;
        const max = typeof schema.maximum === "number" ? schema.maximum : undefined;
        if (min !== undefined && max !== undefined) return Math.floor((min + max) / 2);
        if (min !== undefined) return min;
        if (max !== undefined) return max;
        return 1;
      }
      case "boolean": return true;
      case "array": return [];
      case "object": return {};
      case "null": return null;
      default: return "test";
    }
  }
}
