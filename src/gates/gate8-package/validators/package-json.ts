import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class PackageJsonValidator implements IValidator {
  readonly name = "package-json";
  readonly description = "Validates package.json has required fields for npm publishing and MCP server distribution";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.packagePath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No package path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    let hasFail = false;
    const pkgPath = join(ctx.packagePath, "package.json");

    if (!existsSync(pkgPath)) {
      return {
        validatorName: this.name, severity: Severity.FAIL,
        message: "package.json not found", details: { path: ctx.packagePath },
        durationMs: 0, evidence: ["Missing package.json"],
      };
    }

    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    } catch (err) {
      return {
        validatorName: this.name, severity: Severity.FAIL,
        message: "package.json is not valid JSON", details: {},
        durationMs: 0, evidence: [`Parse error: ${err instanceof Error ? err.message : String(err)}`],
      };
    }

    // Required fields
    if (!pkg.name || typeof pkg.name !== "string") {
      evidence.push("Missing or invalid 'name' field");
      hasFail = true;
    }
    if (!pkg.version || typeof pkg.version !== "string") {
      evidence.push("Missing or invalid 'version' field");
      hasFail = true;
    }
    if (!pkg.description || typeof pkg.description !== "string") {
      evidence.push("Missing 'description' — npm listing will be empty");
      hasFail = true;
    }

    // MCP-specific: should have a bin entry for the server
    const bin = pkg.bin as Record<string, string> | string | undefined;
    if (!bin) {
      evidence.push("No 'bin' field — package won't be executable via npx");
    }

    // Should have keywords for discoverability
    const keywords = pkg.keywords as string[] | undefined;
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      evidence.push("No 'keywords' — reduces discoverability on npm");
    } else {
      const hasMcpKeyword = keywords.some((k) =>
        /^(mcp|model-context-protocol|mcp-server)$/i.test(k)
      );
      if (!hasMcpKeyword) {
        evidence.push("Keywords don't include 'mcp' or 'model-context-protocol' — hard to find on npm");
      }
    }

    // License
    if (!pkg.license) {
      evidence.push("No 'license' field — required for open source publishing");
    }

    // Repository
    if (!pkg.repository) {
      evidence.push("No 'repository' field — npm won't link to source code");
    }

    // Engines
    if (!pkg.engines) {
      evidence.push("No 'engines' field — consumers won't know minimum Node.js version");
    }

    // Main/types for library usage
    if (!pkg.main && !pkg.exports) {
      evidence.push("No 'main' or 'exports' — package can't be imported as a library");
    }

    return {
      validatorName: this.name,
      severity: hasFail ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: hasFail ? "package.json validation failed" : evidence.length > 0 ? `${evidence.length} package.json concern(s)` : "package.json is ready for publishing",
      details: { name: pkg.name, version: pkg.version },
      durationMs: 0,
      evidence,
    };
  }
}
