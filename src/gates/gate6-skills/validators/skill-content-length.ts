import { readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { parseFrontmatter, countWords } from "../../../utils/frontmatter.js";

export class SkillContentLengthValidator implements IValidator {
  readonly name = "skill-content-length";
  readonly description = "Checks markdown body is 1500-2000 words (recommended)";
  readonly dependencies = ["skill-structure"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.skillPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No skill path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const content = readFileSync(join(ctx.skillPath, "SKILL.md"), "utf-8");
    const { body } = parseFrontmatter(content);
    const wordCount = countWords(body);

    if (wordCount < 100) {
      evidence.push(`Body has only ${wordCount} words — skill needs more content to be useful`);
    } else if (wordCount < 1500) {
      evidence.push(`Body has ${wordCount} words — recommended minimum is 1500 for comprehensive skills`);
    } else if (wordCount > 2000) {
      evidence.push(`Body has ${wordCount} words — recommended maximum is 2000. Consider moving details to references/`);
    }

    return {
      validatorName: this.name,
      severity: wordCount < 100 ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `Word count: ${wordCount} (recommended: 1500-2000)` : `Word count: ${wordCount} — within recommended range`,
      details: { wordCount },
      durationMs: 0,
      evidence,
    };
  }
}
