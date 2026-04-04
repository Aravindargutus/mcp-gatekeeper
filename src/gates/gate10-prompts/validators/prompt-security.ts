import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { PROMPT_INJECTION_PATTERNS } from "../../../utils/patterns.js";

export class PromptSecurityValidator implements IValidator {
  readonly name = "prompt-security";
  readonly description = "Scans prompt templates for injection patterns and hidden instructions";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.prompts.length === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No prompts", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    for (const prompt of ctx.prompts) {
      const name = prompt.name as string ?? "unnamed";
      const fullText = JSON.stringify(prompt);

      for (const pattern of PROMPT_INJECTION_PATTERNS) {
        if (pattern.test(fullText)) {
          evidence.push(`Prompt "${name}": matches injection pattern ${pattern.source}`);
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.FAIL : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} prompt security issue(s)` : "No injection patterns in prompts",
      details: {},
      durationMs: 0,
      evidence,
    };
  }
}
