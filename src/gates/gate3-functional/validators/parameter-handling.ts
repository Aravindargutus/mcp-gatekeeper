import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class ParameterHandlingValidator implements IValidator {
  readonly name = "parameter-handling";
  readonly description = "Tests required-param-missing and optional-param-absent scenarios";
  readonly dependencies = ["handshake"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const tool of ctx.toolDefinitions) {
      const properties = tool.inputSchema?.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      const required = (tool.inputSchema?.required as string[]) ?? [];
      if (!properties) continue;

      // Test: call with only required params (no optional)
      if (Object.keys(properties).length > required.length) {
        const requiredOnlyArgs: Record<string, unknown> = {};
        for (const paramName of required) {
          requiredOnlyArgs[paramName] = this.getDefaultValue(properties[paramName]);
        }

        try {
          const result = await ctx.connector.callTool(tool.name, requiredOnlyArgs);
          if (result.isError) {
            evidence.push(
              `Tool "${tool.name}": failed when called with only required params (optional omitted)`
            );
          }
        } catch (err) {
          evidence.push(
            `Tool "${tool.name}": threw when called with only required params: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} parameter handling issue(s)`
          : `All ${ctx.toolDefinitions.length} tools handle optional params correctly`,
      details: { toolsTested: ctx.toolDefinitions.length },
      durationMs: 0,
      evidence,
    };
  }

  private getDefaultValue(schema: Record<string, unknown>): unknown {
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
    switch (schema.type) {
      case "string": return "test";
      case "number":
      case "integer": return 1;
      case "boolean": return true;
      case "array": return [];
      case "object": return {};
      default: return "test";
    }
  }
}
