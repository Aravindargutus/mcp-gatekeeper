import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class PromptMetadataValidator implements IValidator {
  readonly name = "prompt-metadata";
  readonly description = "Validates prompt definitions have required fields (name, description)";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.prompts.length === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "Server exposes no prompts", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    for (const prompt of ctx.prompts) {
      if (!prompt.name || typeof prompt.name !== "string") {
        evidence.push(`Prompt missing 'name' field`);
      }
      if (!prompt.description || typeof prompt.description !== "string") {
        evidence.push(`Prompt "${prompt.name ?? "unnamed"}": missing 'description'`);
      }
    }

    // Check name uniqueness
    const names = ctx.prompts.map((p) => p.name as string).filter(Boolean);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
      evidence.push(`Duplicate prompt names: ${[...new Set(duplicates)].join(", ")}`);
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.FAIL : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} prompt metadata issue(s)` : `${ctx.prompts.length} prompts validated`,
      details: { promptCount: ctx.prompts.length },
      durationMs: 0,
      evidence,
    };
  }
}
