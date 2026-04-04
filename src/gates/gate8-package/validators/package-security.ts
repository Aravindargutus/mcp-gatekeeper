import { existsSync, readdirSync, readFileSync } from "fs";
import { join, extname } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { SECRET_PATTERNS } from "../../../utils/patterns.js";

const SENSITIVE_FILES = [
  ".env", ".env.local", ".env.production", ".env.development",
  ".npmrc", ".yarnrc",
  "id_rsa", "id_ed25519", "id_ecdsa",
  ".ssh", ".aws", ".gcloud",
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next"]);

export class PackageSecurityValidator implements IValidator {
  readonly name = "package-security";
  readonly description = "Scans package for sensitive files, secrets in source, and .env files that would be published";
  readonly dependencies = ["package-json"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.packagePath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No package path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];

    // Check for sensitive files that shouldn't be published
    for (const sensitive of SENSITIVE_FILES) {
      if (existsSync(join(ctx.packagePath, sensitive))) {
        evidence.push(`Sensitive file "${sensitive}" exists in package root — will be published unless excluded`);
      }
    }

    // Check .gitignore covers common sensitive patterns
    const gitignorePath = join(ctx.packagePath, ".gitignore");
    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, "utf-8");
      if (!gitignore.includes(".env")) {
        evidence.push(".gitignore doesn't exclude .env files");
      }
      if (!gitignore.includes("node_modules")) {
        evidence.push(".gitignore doesn't exclude node_modules");
      }
    } else {
      evidence.push("No .gitignore file — sensitive files may be committed");
    }

    // Scan source files for hardcoded secrets (top-level only, not node_modules)
    const sourceFiles = this.collectSourceFiles(ctx.packagePath);
    for (const filePath of sourceFiles) {
      const relativePath = filePath.replace(ctx.packagePath, "").replace(/^\//, "");
      try {
        const content = readFileSync(filePath, "utf-8");
        for (const { name, pattern } of SECRET_PATTERNS) {
          if (pattern.test(content)) {
            evidence.push(`File "${relativePath}": potential ${name} detected`);
          }
        }
      } catch { /* skip */ }
    }

    const secretFindings = evidence.filter((e) =>
      e.includes("potential") || e.includes("Sensitive file")
    );

    return {
      validatorName: this.name,
      severity: secretFindings.length > 0 ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: secretFindings.length > 0
        ? `${secretFindings.length} security issue(s) found in package`
        : evidence.length > 0
          ? `${evidence.length} packaging concern(s)`
          : `Package security scan clean (${sourceFiles.length} files scanned)`,
      details: { filesScanned: sourceFiles.length, secretFindings: secretFindings.length },
      durationMs: 0,
      evidence,
    };
  }

  private collectSourceFiles(dir: string, depth = 3): string[] {
    if (depth <= 0) return [];
    const results: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.isDirectory()) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.collectSourceFiles(fullPath, depth - 1));
        } else {
          const ext = extname(entry.name);
          if ([".ts", ".js", ".json", ".yaml", ".yml", ".env", ".toml"].includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch { /* skip */ }
    return results;
  }
}
