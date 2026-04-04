import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class SkillReferencesValidator implements IValidator {
  readonly name = "skill-references";
  readonly description = "Checks files in references/ are readable and linked from SKILL.md";
  readonly dependencies = ["skill-structure"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.skillPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No skill path", details: {}, durationMs: 0, evidence: [] };
    }

    const refsDir = join(ctx.skillPath, "references");
    if (!existsSync(refsDir)) {
      return { validatorName: this.name, severity: Severity.PASS, message: "No references/ directory (optional)", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const skillMd = readFileSync(join(ctx.skillPath, "SKILL.md"), "utf-8");

    const refFiles = readdirSync(refsDir).filter((f) => !f.startsWith("."));
    for (const file of refFiles) {
      const filePath = join(refsDir, file);
      try {
        readFileSync(filePath);
      } catch {
        evidence.push(`Reference file unreadable: references/${file}`);
        continue;
      }

      // Check if SKILL.md links to this file
      const isLinked = skillMd.includes(`references/${file}`) || skillMd.includes(file);
      if (!isLinked) {
        evidence.push(`Reference file "references/${file}" exists but is not linked from SKILL.md`);
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.some((e) => e.includes("unreadable")) ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} reference issue(s)` : `${refFiles.length} reference file(s) validated`,
      details: { fileCount: refFiles.length },
      durationMs: 0,
      evidence,
    };
  }
}
