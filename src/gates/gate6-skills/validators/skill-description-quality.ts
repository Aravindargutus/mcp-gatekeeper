import { readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { parseFrontmatter } from "../../../utils/frontmatter.js";
import { PLACEHOLDER_PATTERNS } from "../../../utils/patterns.js";

export class SkillDescriptionQualityValidator implements IValidator {
  readonly name = "skill-description-quality";
  readonly description = "Checks description clarity for Claude auto-invocation";
  readonly dependencies = ["skill-frontmatter"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.skillPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No skill path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const content = readFileSync(join(ctx.skillPath, "SKILL.md"), "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    const desc = frontmatter.description as string;
    const name = frontmatter.name as string;

    if (!desc) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No description to validate", details: {}, durationMs: 0, evidence: [] };
    }

    // Check for placeholders
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(desc)) {
        evidence.push(`Description contains placeholder text matching: ${pattern.source}`);
      }
    }

    // Should be specific enough (>30 chars)
    if (desc.length < 30) {
      evidence.push(`Description too short (${desc.length} chars) — Claude needs enough context for auto-invocation`);
    }

    // Should not just repeat the name
    if (name && desc.toLowerCase().trim() === name.toLowerCase().trim()) {
      evidence.push("Description just repeats the skill name — should explain what it does");
    }

    // Should start with an action phrase (helps Claude decide when to invoke)
    const startsWithAction = /^(use|create|build|generate|help|manage|review|validate|run|deploy|test|check|analyze|search|find|debug|optimize|configure|setup|monitor)/i.test(desc);
    if (!startsWithAction) {
      evidence.push("Description should start with an action verb (Use, Create, Build, etc.) for better auto-invocation");
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} description quality concern(s)` : "Description quality is good",
      details: { descriptionLength: desc.length },
      durationMs: 0,
      evidence,
    };
  }
}
