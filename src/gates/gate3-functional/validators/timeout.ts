import { z } from "zod";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

const TimeoutConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeoutMs: z.number().min(1000).max(300_000).default(30_000),
}).passthrough();

export class TimeoutValidator implements IValidator {
  readonly name = "timeout";
  readonly description = "Verifies tool responses arrive within configurable timeout";
  readonly dependencies = ["handshake"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    const rawConfig = ctx.config.gates[3]?.validators?.["timeout"] ?? {};
    const config = TimeoutConfigSchema.parse(rawConfig);
    const timeoutMs = config.timeoutMs;

    for (const tool of ctx.toolDefinitions) {
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

      const start = performance.now();
      try {
        await Promise.race([
          ctx.connector.callTool(tool.name, args),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), timeoutMs)
          ),
        ]);
        const elapsed = performance.now() - start;

        if (elapsed > timeoutMs * 0.8) {
          evidence.push(
            `Tool "${tool.name}": slow response ${Math.round(elapsed)}ms (${Math.round((elapsed / timeoutMs) * 100)}% of ${timeoutMs}ms timeout)`
          );
        }
      } catch (err) {
        if (err instanceof Error && err.message === "timeout") {
          evidence.push(`Tool "${tool.name}": timed out after ${timeoutMs}ms`);
        } else {
          const elapsed = performance.now() - start;
          evidence.push(
            `Tool "${tool.name}": failed after ${Math.round(elapsed)}ms: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    const timeouts = evidence.filter((e) => e.includes("timed out"));
    return {
      validatorName: this.name,
      severity: timeouts.length > 0 ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        timeouts.length > 0
          ? `${timeouts.length} tool(s) timed out (limit: ${timeoutMs}ms)`
          : evidence.length > 0
            ? `All tools responded within timeout but ${evidence.length} slow response(s)`
            : `All ${ctx.toolDefinitions.length} tools responded within ${timeoutMs}ms`,
      details: { timeoutMs, toolsTested: ctx.toolDefinitions.length },
      durationMs: 0,
      evidence,
    };
  }
}
