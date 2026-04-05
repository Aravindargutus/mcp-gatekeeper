import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult, ToolDefinition } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { mapWithConcurrency } from "../../../utils/concurrency.js";
import { logger } from "../../../utils/logger.js";
import type { KnowledgeBase } from "../../../chain-discovery/knowledge-base.js";

const CONCURRENCY = 10;

export class ToolInvocationValidator implements IValidator {
  readonly name = "tool-invocation";
  readonly description = "Calls each tool with valid sample inputs and verifies responses (parallel)";
  readonly dependencies = ["handshake"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let failCount = 0;
    const kb = ctx.knowledgeBase as KnowledgeBase | undefined;

    if (kb) {
      logger.debug(`Invoking ${ctx.toolDefinitions.length} tools with knowledge base (${Object.keys(kb.getAllSeedData()).length} real IDs)`);
    } else {
      logger.debug(`Invoking ${ctx.toolDefinitions.length} tools with sample args (no knowledge base)`);
    }

    const results = await mapWithConcurrency(
      ctx.toolDefinitions,
      CONCURRENCY,
      async (tool) => {
        const args = kb
          ? this.buildArgsFromKnowledgeBase(tool, kb)
          : this.generateSampleArgs(tool.inputSchema);
        const result = await ctx.connector.callTool(tool.name, args);
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

  /**
   * Build args using real IDs from the knowledge base.
   * For each param, search the knowledge base seed data for a matching key.
   * Falls back to generateValue() if no match found.
   */
  private buildArgsFromKnowledgeBase(
    tool: ToolDefinition,
    kb: KnowledgeBase
  ): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const schema = tool.inputSchema;
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    const required = (schema.required as string[]) ?? [];
    if (!properties) return args;
    const seedData = kb.getAllSeedData();

    for (const [paramName, paramSchema] of Object.entries(properties)) {
      // For object-type params (like path_variables, query_params), build nested values
      if (paramSchema.type === "object" && paramSchema.properties) {
        const nestedProps = paramSchema.properties as Record<string, Record<string, unknown>>;
        const nested: Record<string, unknown> = {};
        for (const [nestedKey, nestedSchema] of Object.entries(nestedProps)) {
          // Search seed data for a matching key
          const realValue = this.findInSeedData(nestedKey, seedData);
          if (realValue != null) {
            nested[nestedKey] = realValue;
          } else if (required.includes(paramName)) {
            nested[nestedKey] = this.generateValue(nestedSchema);
          }
        }
        if (Object.keys(nested).length > 0) {
          args[paramName] = nested;
        }
      } else {
        // Simple param — check seed data first
        const realValue = this.findInSeedData(paramName, seedData);
        if (realValue != null) {
          args[paramName] = realValue;
        } else if (required.includes(paramName)) {
          args[paramName] = this.generateValue(paramSchema);
        }
      }
    }

    return args;
  }

  /** Search seed data for a key that matches the param name (fuzzy) */
  private findInSeedData(paramName: string, seedData: Record<string, unknown>): unknown {
    // Exact match
    if (paramName in seedData) return seedData[paramName];

    // Fuzzy: remove common suffixes/prefixes and try
    const normalized = paramName.toLowerCase().replace(/_/g, "");
    for (const [key, value] of Object.entries(seedData)) {
      const normalizedKey = key.toLowerCase().replace(/_/g, "");
      if (normalizedKey === normalized) return value;
      // Partial match: "portal_id" in seed matches "portal_id" param
      if (normalizedKey.includes(normalized) || normalized.includes(normalizedKey)) {
        if (Math.abs(normalizedKey.length - normalized.length) <= 3) return value;
      }
    }

    return null;
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
