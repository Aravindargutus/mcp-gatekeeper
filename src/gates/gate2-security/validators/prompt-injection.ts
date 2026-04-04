import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { PROMPT_INJECTION_PATTERNS } from "../../../utils/patterns.js";

export class PromptInjectionValidator implements IValidator {
  readonly name = "prompt-injection";
  readonly description = "Detects prompt injection patterns in tool descriptions and metadata";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const tool of ctx.toolDefinitions) {
      // Scan all text fields in the tool definition
      const textsToScan: Array<{ field: string; value: string }> = [];

      if (tool.description) {
        textsToScan.push({ field: "description", value: tool.description });
      }
      if (tool.title) {
        textsToScan.push({ field: "title", value: tool.title });
      }

      // Scan parameter descriptions
      const properties = tool.inputSchema?.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (properties) {
        for (const [paramName, paramSchema] of Object.entries(properties)) {
          if (paramSchema.description && typeof paramSchema.description === "string") {
            textsToScan.push({
              field: `param "${paramName}" description`,
              value: paramSchema.description,
            });
          }
          // Also check enum values for hidden instructions
          if (Array.isArray(paramSchema.enum)) {
            for (const enumVal of paramSchema.enum) {
              if (typeof enumVal === "string" && enumVal.length > 50) {
                textsToScan.push({
                  field: `param "${paramName}" enum value`,
                  value: enumVal,
                });
              }
            }
          }
        }
      }

      // Scan annotations
      if (tool.annotations) {
        const annotationStr = JSON.stringify(tool.annotations);
        textsToScan.push({ field: "annotations", value: annotationStr });
      }

      // Check each text against injection patterns
      for (const { field, value } of textsToScan) {
        for (const pattern of PROMPT_INJECTION_PATTERNS) {
          if (pattern.test(value)) {
            evidence.push(
              `Tool "${tool.name}", ${field}: matches injection pattern ${pattern.source}`
            );
          }
        }
      }
    }

    const severity =
      evidence.length > 0 ? Severity.FAIL : Severity.PASS;

    return {
      validatorName: this.name,
      severity,
      message:
        evidence.length > 0
          ? `${evidence.length} potential prompt injection(s) detected`
          : "No prompt injection patterns found",
      details: { issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }
}
