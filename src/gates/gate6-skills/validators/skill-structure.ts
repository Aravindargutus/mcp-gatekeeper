import { existsSync, statSync, readdirSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

const VALID_SUBDIRS = new Set(["scripts", "references", "assets"]);
const REQUIRED_FILE = "SKILL.md";

export class SkillStructureValidator implements IValidator {
  readonly name = "skill-structure";
  readonly description = "Validates skill directory has SKILL.md and valid subdirectories";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.skillPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No skill path provided", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    let hasFail = false;

    if (!existsSync(ctx.skillPath) || !statSync(ctx.skillPath).isDirectory()) {
      return {
        validatorName: this.name, severity: Severity.FAIL,
        message: `Skill path does not exist or is not a directory: ${ctx.skillPath}`,
        details: {}, durationMs: 0, evidence: [`Path "${ctx.skillPath}" is not a valid directory`],
      };
    }

    const skillMdPath = join(ctx.skillPath, REQUIRED_FILE);
    if (!existsSync(skillMdPath)) {
      evidence.push(`Missing required file: ${REQUIRED_FILE}`);
      hasFail = true;
    }

    const entries = readdirSync(ctx.skillPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === REQUIRED_FILE) continue;
      if (entry.name.startsWith(".")) continue; // ignore dotfiles
      if (entry.isDirectory() && !VALID_SUBDIRS.has(entry.name)) {
        evidence.push(`Unexpected subdirectory: "${entry.name}" (expected: ${[...VALID_SUBDIRS].join(", ")})`);
      }
    }

    return {
      validatorName: this.name,
      severity: hasFail ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: hasFail ? "Skill structure is invalid" : evidence.length > 0 ? `Structure OK with ${evidence.length} warning(s)` : "Skill structure is valid",
      details: { path: ctx.skillPath },
      durationMs: 0,
      evidence,
    };
  }
}
