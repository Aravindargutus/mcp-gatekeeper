import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { VALID_JSON_SCHEMA_TYPES } from "../../../utils/patterns.js";

export class ParameterTypesValidator implements IValidator {
  readonly name = "parameter-types";
  readonly description = "Validates parameter types are valid JSON Schema types and required array matches properties";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let hasFail = false;

    for (const tool of ctx.toolDefinitions) {
      const schema = tool.inputSchema;
      if (!schema || typeof schema !== "object") continue;

      const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
      const required = schema.required as string[] | undefined;

      // Validate each property's type
      if (properties) {
        for (const [paramName, paramSchema] of Object.entries(properties)) {
          if (paramSchema.type) {
            const types = Array.isArray(paramSchema.type)
              ? paramSchema.type
              : [paramSchema.type];

            for (const type of types) {
              if (!VALID_JSON_SCHEMA_TYPES.includes(type as string)) {
                evidence.push(
                  `Tool "${tool.name}", param "${paramName}": invalid type "${type}". Valid: ${VALID_JSON_SCHEMA_TYPES.join(", ")}`
                );
                hasFail = true;
              }
            }
          }

          // Check array items have type
          if (paramSchema.type === "array" && !paramSchema.items) {
            evidence.push(
              `Tool "${tool.name}", param "${paramName}": array type missing "items" schema`
            );
            hasFail = true;
          }
        }
      }

      // Validate required array references existing properties
      if (required && Array.isArray(required)) {
        for (const reqParam of required) {
          if (!properties || !(reqParam in properties)) {
            evidence.push(
              `Tool "${tool.name}": required param "${reqParam}" not found in properties`
            );
            hasFail = true;
          }
        }
      }

      // Check for properties without type (valid but may indicate oversight)
      if (properties) {
        for (const [paramName, paramSchema] of Object.entries(properties)) {
          if (
            !paramSchema.type &&
            !paramSchema.oneOf &&
            !paramSchema.anyOf &&
            !paramSchema.allOf &&
            !paramSchema.$ref &&
            !paramSchema.enum &&
            !paramSchema.const
          ) {
            evidence.push(
              `Tool "${tool.name}", param "${paramName}": missing type definition`
            );
            hasFail = true;
          }
        }
      }
    }

    return {
      validatorName: this.name,
      severity: hasFail ? Severity.FAIL : Severity.PASS,
      message: hasFail
        ? `${evidence.length} parameter type issue(s) found`
        : "All parameter types are valid",
      details: { issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }
}
