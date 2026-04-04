import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class BoundaryTestingValidator implements IValidator {
  readonly name = "boundary-testing";
  readonly description = "Sends invalid inputs (null, wrong types, oversized) and checks for graceful error handling";
  readonly dependencies = ["handshake"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let failCount = 0;

    for (const tool of ctx.toolDefinitions) {
      const required = (tool.inputSchema?.required as string[]) ?? [];
      const properties = tool.inputSchema?.properties as
        | Record<string, Record<string, unknown>>
        | undefined;

      // Test 1: Empty object when required params exist
      if (required.length > 0) {
        try {
          const result = await ctx.connector.callTool(tool.name, {});
          if (!result.isError) {
            evidence.push(
              `Tool "${tool.name}": accepted empty args despite required params [${required.join(", ")}]`
            );
            failCount++;
          }
          ctx.errorResponses.set(`${tool.name}:empty`, result);
        } catch {
          // Throwing is acceptable for invalid input
        }
      }

      // Test 2: Wrong types for required params
      if (properties && required.length > 0) {
        const wrongTypeArgs: Record<string, unknown> = {};
        for (const paramName of required) {
          const paramSchema = properties[paramName];
          if (!paramSchema) continue;
          wrongTypeArgs[paramName] = this.getWrongTypeValue(paramSchema);
        }

        try {
          const result = await ctx.connector.callTool(tool.name, wrongTypeArgs);
          if (!result.isError) {
            evidence.push(
              `Tool "${tool.name}": accepted wrong-type arguments without error`
            );
            failCount++;
          }
        } catch {
          // Throwing is acceptable
        }
      }

      // Test 3: Oversized string input
      if (properties) {
        const stringParam = Object.entries(properties).find(
          ([_, s]) => s.type === "string"
        );
        if (stringParam) {
          const [paramName] = stringParam;
          const oversizedArgs: Record<string, unknown> = {};
          for (const req of required) {
            if (req === paramName) continue;
            oversizedArgs[req] = "test";
          }
          oversizedArgs[paramName] = "x".repeat(100_000);

          try {
            const result = await ctx.connector.callTool(tool.name, oversizedArgs);
            if (!result.isError) {
              evidence.push(
                `Tool "${tool.name}": accepted 100KB string for "${paramName}" without error`
              );
            }
          } catch {
            // Acceptable
          }
        }
      }
    }

    return {
      validatorName: this.name,
      severity: failCount > 0 ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        failCount > 0
          ? `${failCount} tool(s) failed boundary testing`
          : evidence.length > 0
            ? `Boundary testing passed with ${evidence.length} observation(s)`
            : `All ${ctx.toolDefinitions.length} tools handle invalid inputs gracefully`,
      details: { toolsTested: ctx.toolDefinitions.length, failCount },
      durationMs: 0,
      evidence,
    };
  }

  private getWrongTypeValue(schema: Record<string, unknown>): unknown {
    switch (schema.type) {
      case "string": return 12345;
      case "number":
      case "integer": return "not_a_number";
      case "boolean": return "not_a_boolean";
      case "array": return "not_an_array";
      case "object": return "not_an_object";
      default: return null;
    }
  }
}
