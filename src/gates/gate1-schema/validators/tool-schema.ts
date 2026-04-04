import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class ToolSchemaValidator implements IValidator {
  readonly name = "tool-schema";
  readonly description = "Validates inputSchema/outputSchema are valid JSON Schema";

  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let hasFail = false;

    for (const tool of ctx.toolDefinitions) {
      // inputSchema is required per MCP spec
      if (!tool.inputSchema || typeof tool.inputSchema !== "object") {
        evidence.push(`Tool "${tool.name}": inputSchema is missing or not an object`);
        hasFail = true;
        continue;
      }

      // Validate inputSchema is valid JSON Schema
      try {
        this.ajv.compile(tool.inputSchema);
      } catch (err) {
        evidence.push(
          `Tool "${tool.name}": inputSchema is not valid JSON Schema: ${err instanceof Error ? err.message : String(err)}`
        );
        hasFail = true;
      }

      // Check inputSchema has type: "object" (MCP convention)
      if (tool.inputSchema.type !== "object") {
        evidence.push(
          `Tool "${tool.name}": inputSchema.type should be "object", got "${tool.inputSchema.type}"`
        );
        hasFail = true;
      }

      // Validate outputSchema if present
      if (tool.outputSchema) {
        if (typeof tool.outputSchema !== "object") {
          evidence.push(`Tool "${tool.name}": outputSchema is not an object`);
          hasFail = true;
        } else {
          try {
            this.ajv.compile(tool.outputSchema);
          } catch (err) {
            evidence.push(
              `Tool "${tool.name}": outputSchema is not valid JSON Schema: ${err instanceof Error ? err.message : String(err)}`
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
        ? `${evidence.length} schema issue(s) found`
        : `All tool schemas are valid JSON Schema`,
      details: { issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }
}
