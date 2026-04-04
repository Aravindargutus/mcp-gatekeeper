import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class InputSanitizationValidator implements IValidator {
  readonly name = "input-sanitization";
  readonly description = "Checks if string parameters have appropriate constraints (maxLength, pattern, enum)";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let failCount = 0;
    let warnCount = 0;

    for (const tool of ctx.toolDefinitions) {
      const properties = tool.inputSchema?.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!properties) continue;

      for (const [paramName, paramSchema] of Object.entries(properties)) {
        if (paramSchema.type !== "string") continue;

        const hasMaxLength = typeof paramSchema.maxLength === "number";
        const hasPattern = typeof paramSchema.pattern === "string";
        const hasEnum = Array.isArray(paramSchema.enum);
        const hasFormat = typeof paramSchema.format === "string";
        const hasConst = paramSchema.const !== undefined;

        if (!hasMaxLength && !hasPattern && !hasEnum && !hasFormat && !hasConst) {
          // No constraints at all — FAIL severity (wide-open attack surface)
          evidence.push(
            `Tool "${tool.name}", param "${paramName}": string without ANY constraints (no maxLength, pattern, enum, or format) — wide-open attack surface`
          );
          failCount++;
        } else if (!hasMaxLength && !hasEnum && !hasConst) {
          // Has some constraint (pattern/format) but no length bound — WARN (resource exhaustion risk)
          evidence.push(
            `Tool "${tool.name}", param "${paramName}": string without maxLength — accepts unbounded input (resource exhaustion risk)`
          );
          warnCount++;
        }
      }
    }

    const severity = failCount > 0 ? Severity.FAIL : warnCount > 0 ? Severity.WARN : Severity.PASS;

    return {
      validatorName: this.name,
      severity,
      message:
        failCount > 0
          ? `${failCount} unconstrained string(s) found, ${warnCount} missing maxLength`
          : warnCount > 0
            ? `${warnCount} string param(s) missing maxLength`
            : "All string parameters have appropriate constraints",
      details: { failCount, warnCount },
      durationMs: 0,
      evidence,
    };
  }
}
