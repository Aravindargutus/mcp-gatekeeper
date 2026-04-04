import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, extname } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { SECRET_PATTERNS, DANGEROUS_CODE_PATTERNS } from "../../../utils/patterns.js";

const SCANNABLE_EXTENSIONS = new Set([".ts", ".js", ".tsx", ".jsx", ".json", ".yaml", ".yml", ".env", ".toml"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

export class ExtensionSecurityValidator implements IValidator {
  readonly name = "extension-security";
  readonly description = "Scans extension source files for secrets and dangerous code patterns";
  readonly dependencies = ["extension-manifest"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.extensionPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No extension path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    let secretCount = 0;
    let dangerousCount = 0;
    const files = this.collectFiles(ctx.extensionPath);

    for (const filePath of files) {
      const relativePath = filePath.replace(ctx.extensionPath, "").replace(/^\//, "");
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      // Check for secrets
      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          evidence.push(`File "${relativePath}": potential ${name} detected`);
          secretCount++;
        }
      }

      // Check for dangerous patterns
      for (const pattern of DANGEROUS_CODE_PATTERNS) {
        if (pattern.test(content)) {
          evidence.push(`File "${relativePath}": dangerous pattern ${pattern.source}`);
          dangerousCount++;
        }
      }
    }

    const severity = secretCount > 0 ? Severity.FAIL : dangerousCount > 0 ? Severity.WARN : Severity.PASS;

    return {
      validatorName: this.name,
      severity,
      message:
        secretCount > 0
          ? `${secretCount} secret(s) found in extension source`
          : dangerousCount > 0
            ? `${dangerousCount} dangerous pattern(s) found`
            : `${files.length} file(s) scanned — clean`,
      details: { filesScanned: files.length, secretCount, dangerousCount },
      durationMs: 0,
      evidence,
    };
  }

  private collectFiles(dir: string, maxDepth = 5): string[] {
    if (maxDepth <= 0) return [];
    const results: string[] = [];

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && SKIP_DIRS.has(entry.name)) continue;
        if (SKIP_DIRS.has(entry.name)) continue;

        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.collectFiles(fullPath, maxDepth - 1));
        } else if (entry.isFile() && SCANNABLE_EXTENSIONS.has(extname(entry.name))) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip unreadable dirs
    }

    return results;
  }
}
