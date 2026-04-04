import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class ToolInvocationValidator implements IValidator {
  readonly name = "tool-invocation";
  readonly description = "Calls each tool with valid sample inputs and verifies responses";
  readonly dependencies = ["handshake"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let failCount = 0;

    for (const tool of ctx.toolDefinitions) {
      const sampleArgs = this.generateSampleArgs(tool.inputSchema);

      try {
        const result = await ctx.connector.callTool(tool.name, sampleArgs);
        ctx.invocationResults.set(tool.name, result);

        if (!result.content || !Array.isArray(result.content)) {
          evidence.push(`Tool "${tool.name}": response missing 'content' array`);
          failCount++;
          continue;
        }

        for (let i = 0; i < result.content.length; i++) {
          const item = result.content[i];
          if (!item.type) {
            evidence.push(`Tool "${tool.name}": content[${i}] missing 'type' field`);
            failCount++;
          }
        }

        if (result.isError) {
          evidence.push(`Tool "${tool.name}": returned isError=true with valid sample inputs`);
        }
      } catch (err) {
        evidence.push(
          `Tool "${tool.name}": invocation threw: ${err instanceof Error ? err.message : String(err)}`
        );
        failCount++;
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
      details: {
        toolCount: ctx.toolDefinitions.length,
        failCount,
        warnCount: evidence.length - failCount,
      },
      durationMs: 0,
      evidence,
    };
  }

  private generateSampleArgs(schema: Record<string, unknown>): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const properties = schema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
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
      case "boolean":
        return true;
      case "array":
        return [];
      case "object":
        return {};
      case "null":
        return null;
      default:
        return "test";
    }
  }
}
