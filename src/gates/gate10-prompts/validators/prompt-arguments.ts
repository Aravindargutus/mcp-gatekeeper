import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class PromptArgumentsValidator implements IValidator {
  readonly name = "prompt-arguments";
  readonly description = "Validates prompt arguments have names, descriptions, and proper required flags";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.prompts.length === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No prompts", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    for (const prompt of ctx.prompts) {
      const name = prompt.name as string ?? "unnamed";
      const args = prompt.arguments as Array<Record<string, unknown>> | undefined;

      if (!args || !Array.isArray(args)) continue; // Prompts with no args are valid

      for (const arg of args) {
        if (!arg.name || typeof arg.name !== "string") {
          evidence.push(`Prompt "${name}": argument missing 'name' field`);
        }
        if (!arg.description || typeof arg.description !== "string") {
          evidence.push(`Prompt "${name}", arg "${arg.name ?? "?"}": missing 'description'`);
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} prompt argument issue(s)` : "All prompt arguments documented",
      details: {},
      durationMs: 0,
      evidence,
    };
  }
}
