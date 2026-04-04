import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { PLACEHOLDER_PATTERNS } from "../../../utils/patterns.js";

export class ResourceDescriptionValidator implements IValidator {
  readonly name = "resource-description";
  readonly description = "Checks resource descriptions exist and are meaningful";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.resources.length === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No resources", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    for (const resource of ctx.resources) {
      const name = resource.name as string ?? "unnamed";
      const desc = resource.description as string | undefined;

      if (!desc || desc.trim().length === 0) {
        evidence.push(`Resource "${name}": missing description`);
        continue;
      }

      if (desc.length < 10) {
        evidence.push(`Resource "${name}": description too short (${desc.length} chars)`);
      }

      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(desc)) {
          evidence.push(`Resource "${name}": description contains placeholder text`);
          break;
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} resource description issue(s)` : "All resources have descriptions",
      details: {},
      durationMs: 0,
      evidence,
    };
  }
}
