import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

const LICENSE_FILES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md", "COPYING"];

export class LicenseCheckValidator implements IValidator {
  readonly name = "license-check";
  readonly description = "Checks for LICENSE file and README in the package";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.packagePath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No package path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];

    // Check for LICENSE file
    const hasLicense = LICENSE_FILES.some((f) => existsSync(join(ctx.packagePath!, f)));
    if (!hasLicense) {
      evidence.push("No LICENSE file found — required for open source publishing");
    }

    // Check for README
    const files = readdirSync(ctx.packagePath);
    const hasReadme = files.some((f) => /^readme\.(md|txt|rst)$/i.test(f));
    if (!hasReadme) {
      evidence.push("No README file — npm listing will be empty");
    }

    // Check for .npmignore or files field (controls what gets published)
    const hasNpmignore = existsSync(join(ctx.packagePath, ".npmignore"));
    const pkgPath = join(ctx.packagePath, "package.json");
    let hasFilesField = false;
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(require("fs").readFileSync(pkgPath, "utf-8"));
        hasFilesField = Array.isArray(pkg.files);
      } catch { /* ignore */ }
    }
    if (!hasNpmignore && !hasFilesField) {
      evidence.push("No .npmignore or 'files' field in package.json — entire directory may be published (including tests, configs)");
    }

    return {
      validatorName: this.name,
      severity: evidence.some((e) => e.includes("LICENSE")) ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} packaging concern(s)` : "License and README present",
      details: { hasLicense, hasReadme: !!hasReadme },
      durationMs: 0,
      evidence,
    };
  }
}
