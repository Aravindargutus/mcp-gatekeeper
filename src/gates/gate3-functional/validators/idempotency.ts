import { z } from "zod";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

const IdempotencyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  repeatCount: z.number().min(2).max(10).default(3),
}).passthrough();

export class IdempotencyValidator implements IValidator {
  readonly name = "idempotency";
  readonly description = "Calls read-like tools N times with identical input and checks for consistent responses";
  readonly dependencies = ["handshake"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    const rawConfig = ctx.config.gates[3]?.validators?.["idempotency"] ?? {};
    const config = IdempotencyConfigSchema.parse(rawConfig);
    const repeatCount = config.repeatCount;

    // Only test read-like tools (skip write/delete tools)
    const readTools = ctx.toolDefinitions.filter((tool) => {
      const text = `${tool.name} ${tool.description ?? ""}`;
      return /\b(get|list|search|find|read|fetch|retrieve|query|show|view|check|count)\b/i.test(text);
    });

    for (const tool of readTools) {
      const required = (tool.inputSchema?.required as string[]) ?? [];
      const properties = tool.inputSchema?.properties as
        | Record<string, Record<string, unknown>>
        | undefined;

      const args: Record<string, unknown> = {};
      for (const req of required) {
        const schema = properties?.[req];
        if (schema?.default !== undefined) args[req] = schema.default;
        else if (schema?.type === "string") args[req] = "test";
        else if (schema?.type === "number" || schema?.type === "integer") args[req] = 1;
        else if (schema?.type === "boolean") args[req] = true;
        else args[req] = "test";
      }

      const results: string[] = [];
      for (let i = 0; i < repeatCount; i++) {
        try {
          const result = await ctx.connector.callTool(tool.name, args);
          results.push(JSON.stringify(result.content));
        } catch (err) {
          results.push(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const uniqueResults = new Set(results);
      if (uniqueResults.size > 1) {
        evidence.push(
          `Tool "${tool.name}": produced ${uniqueResults.size} different results across ${repeatCount} identical calls`
        );
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} idempotency concern(s)`
          : `${readTools.length} read tools produce consistent results across ${repeatCount} calls`,
      details: { repeatCount, toolsTested: readTools.length },
      durationMs: 0,
      evidence,
    };
  }
}
