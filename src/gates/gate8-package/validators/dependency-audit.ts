import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { SECRET_PATTERNS } from "../../../utils/patterns.js";

export class DependencyAuditValidator implements IValidator {
  readonly name = "dependency-audit";
  readonly description = "Audits dependencies for known issues: pinned versions, excessive deps, secrets in lockfile";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.packagePath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No package path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const pkgPath = join(ctx.packagePath, "package.json");

    if (!existsSync(pkgPath)) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No package.json", details: {}, durationMs: 0, evidence: [] };
    }

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const deps = pkg.dependencies as Record<string, string> | undefined ?? {};
    const devDeps = pkg.devDependencies as Record<string, string> | undefined ?? {};

    // Check for excessive production dependencies
    const depCount = Object.keys(deps).length;
    if (depCount > 30) {
      evidence.push(`${depCount} production dependencies — consider reducing to minimize install size and attack surface`);
    }

    // Check for unpinned dependency versions (*)
    for (const [name, version] of Object.entries(deps)) {
      if (version === "*" || version === "latest") {
        evidence.push(`Dependency "${name}": version "${version}" is unpinned — use a specific range`);
      }
    }

    // Check for devDependencies that should be in dependencies
    const mcpSdk = devDeps["@modelcontextprotocol/sdk"];
    if (mcpSdk && !deps["@modelcontextprotocol/sdk"]) {
      evidence.push("@modelcontextprotocol/sdk is in devDependencies but should be in dependencies for an MCP server");
    }

    // Check for secrets in lockfile
    const lockPath = existsSync(join(ctx.packagePath, "package-lock.json"))
      ? join(ctx.packagePath, "package-lock.json")
      : existsSync(join(ctx.packagePath, "pnpm-lock.yaml"))
        ? join(ctx.packagePath, "pnpm-lock.yaml")
        : null;

    if (lockPath) {
      try {
        const lockContent = readFileSync(lockPath, "utf-8");
        for (const { name, pattern } of SECRET_PATTERNS) {
          if (pattern.test(lockContent)) {
            evidence.push(`Lockfile may contain ${name} — review ${lockPath.split("/").pop()}`);
          }
        }
      } catch { /* skip if unreadable */ }
    } else {
      evidence.push("No lockfile found (package-lock.json or pnpm-lock.yaml) — builds may not be reproducible");
    }

    // Check for postinstall scripts (supply chain risk)
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (scripts?.postinstall || scripts?.preinstall || scripts?.install) {
      evidence.push("Package has install lifecycle scripts (preinstall/postinstall) — potential supply chain risk");
    }

    return {
      validatorName: this.name,
      severity: evidence.some((e) => e.includes("secret") || e.includes("Secret")) ? Severity.FAIL
        : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} dependency concern(s)` : `${depCount} dependencies audited — clean`,
      details: { depCount, devDepCount: Object.keys(devDeps).length },
      durationMs: 0,
      evidence,
    };
  }
}
