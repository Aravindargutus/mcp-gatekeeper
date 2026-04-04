import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class ExtensionManifestValidator implements IValidator {
  readonly name = "extension-manifest";
  readonly description = "Validates manifest.json exists with name, version, description, author";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.extensionPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No extension path provided", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    let hasFail = false;
    const manifestPath = join(ctx.extensionPath, "manifest.json");

    if (!existsSync(manifestPath)) {
      return {
        validatorName: this.name, severity: Severity.FAIL,
        message: "manifest.json not found in extension directory",
        details: { path: ctx.extensionPath }, durationMs: 0, evidence: ["Missing manifest.json"],
      };
    }

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch (err) {
      return {
        validatorName: this.name, severity: Severity.FAIL,
        message: "manifest.json is not valid JSON",
        details: {}, durationMs: 0, evidence: [`Parse error: ${err instanceof Error ? err.message : String(err)}`],
      };
    }

    // Required fields
    if (!manifest.name || typeof manifest.name !== "string") {
      evidence.push("Missing or invalid 'name' field (must be a string)");
      hasFail = true;
    }

    if (!manifest.version || typeof manifest.version !== "string") {
      evidence.push("Missing or invalid 'version' field (must be a string)");
      hasFail = true;
    } else if (!/^\d+\.\d+\.\d+/.test(manifest.version as string)) {
      evidence.push(`Version "${manifest.version}" does not follow semver format (x.y.z)`);
    }

    if (!manifest.description || typeof manifest.description !== "string") {
      evidence.push("Missing or invalid 'description' field");
      hasFail = true;
    }

    if (!manifest.author) {
      evidence.push("Missing 'author' field");
    }

    return {
      validatorName: this.name,
      severity: hasFail ? Severity.FAIL : evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: hasFail ? "Manifest validation failed" : evidence.length > 0 ? `Manifest OK with ${evidence.length} warning(s)` : "Manifest is valid",
      details: { name: manifest.name, version: manifest.version },
      durationMs: 0,
      evidence,
    };
  }
}
