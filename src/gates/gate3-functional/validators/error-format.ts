import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class ErrorFormatValidator implements IValidator {
  readonly name = "error-format";
  readonly description = "Verifies error responses follow JSON-RPC error structure";
  readonly dependencies = ["boundary-testing"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const [key, response] of ctx.errorResponses.entries()) {
      const [toolName] = key.split(":");
      const resp = response as Record<string, unknown>;

      if (resp.isError) {
        const content = resp.content as Array<Record<string, unknown>> | undefined;
        if (!content || content.length === 0) {
          evidence.push(
            `Tool "${toolName}": error response has isError=true but no content describing the error`
          );
        } else {
          const hasText = content.some(
            (c) => c.type === "text" && typeof c.text === "string" && (c.text as string).length > 0
          );
          if (!hasText) {
            evidence.push(
              `Tool "${toolName}": error response content lacks descriptive text`
            );
          }
        }
      }
    }

    // Try calling a non-existent tool to test error handling
    try {
      await ctx.connector.callTool("__mcpqa_nonexistent_tool__", {});
      evidence.push("Server accepted a call to a non-existent tool without error");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message || message.length === 0) {
        evidence.push("Server threw for non-existent tool but provided no error message");
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} error format concern(s)`
          : "Error responses are properly formatted",
      details: { errorResponsesChecked: ctx.errorResponses.size },
      durationMs: 0,
      evidence,
    };
  }
}
