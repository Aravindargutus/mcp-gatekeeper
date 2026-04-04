import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class SkillScriptsValidator implements IValidator {
  readonly name = "skill-scripts";
  readonly description = "Checks scripts have shebangs and executable permissions";
  readonly dependencies = ["skill-structure"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.skillPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No skill path", details: {}, durationMs: 0, evidence: [] };
    }

    const scriptsDir = join(ctx.skillPath, "scripts");
    if (!existsSync(scriptsDir)) {
      return { validatorName: this.name, severity: Severity.PASS, message: "No scripts/ directory (optional)", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const scriptFiles = readdirSync(scriptsDir).filter((f) => !f.startsWith("."));

    for (const file of scriptFiles) {
      const filePath = join(scriptsDir, file);
      const stat = statSync(filePath);

      if (!stat.isFile()) continue;

      // Check executable permission
      const isExecutable = (stat.mode & 0o111) !== 0;
      if (!isExecutable) {
        evidence.push(`Script "scripts/${file}" is not executable (chmod +x needed)`);
      }

      // Check for shebang
      try {
        const content = readFileSync(filePath, "utf-8");
        if (!content.startsWith("#!")) {
          evidence.push(`Script "scripts/${file}" missing shebang line (e.g., #!/bin/bash)`);
        }
      } catch {
        evidence.push(`Script "scripts/${file}" is unreadable`);
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.some((e) => e.includes("unreadable")) ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} script issue(s)` : `${scriptFiles.length} script(s) validated`,
      details: { scriptCount: scriptFiles.length },
      durationMs: 0,
      evidence,
    };
  }
}
