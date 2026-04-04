import { readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { parseFrontmatter } from "../../../utils/frontmatter.js";

export class SkillFrontmatterValidator implements IValidator {
  readonly name = "skill-frontmatter";
  readonly description = "Validates SKILL.md YAML frontmatter has required name (max 64 chars) and description (max 200 chars)";
  readonly dependencies = ["skill-structure"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.skillPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No skill path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    let hasFail = false;

    const content = readFileSync(join(ctx.skillPath, "SKILL.md"), "utf-8");
    const { frontmatter, hasFrontmatter } = parseFrontmatter(content);

    if (!hasFrontmatter) {
      return {
        validatorName: this.name, severity: Severity.FAIL,
        message: "SKILL.md has no YAML frontmatter (must start with ---)",
        details: {}, durationMs: 0, evidence: ["No frontmatter delimiters found"],
      };
    }

    // name field
    if (!frontmatter.name || typeof frontmatter.name !== "string") {
      evidence.push("Missing required frontmatter field: name");
      hasFail = true;
    } else if (frontmatter.name.length > 64) {
      evidence.push(`name exceeds 64 chars (${frontmatter.name.length})`);
      hasFail = true;
    }

    // description field
    if (!frontmatter.description || typeof frontmatter.description !== "string") {
      evidence.push("Missing required frontmatter field: description");
      hasFail = true;
    } else if (frontmatter.description.length > 200) {
      evidence.push(`description exceeds 200 chars (${frontmatter.description.length})`);
      hasFail = true;
    }

    return {
      validatorName: this.name,
      severity: hasFail ? Severity.FAIL : Severity.PASS,
      message: hasFail ? `Frontmatter issues found` : "Frontmatter is valid",
      details: { name: frontmatter.name, description: frontmatter.description },
      durationMs: 0,
      evidence,
    };
  }
}
