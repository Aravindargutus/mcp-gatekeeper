import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { DANGEROUS_CODE_PATTERNS } from "../../../utils/patterns.js";

export class DangerousPatternsValidator implements IValidator {
  readonly name = "dangerous-patterns";
  readonly description = "Detects unsafe code execution patterns in tool metadata";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const tool of ctx.toolDefinitions) {
      const fullText = JSON.stringify(tool.raw);

      for (const pattern of DANGEROUS_CODE_PATTERNS) {
        if (pattern.test(fullText)) {
          evidence.push(
            `Tool "${tool.name}": contains dangerous pattern matching ${pattern.source}`
          );
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.FAIL : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} dangerous code pattern(s) detected`
          : "No dangerous patterns found",
      details: { issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }
}
