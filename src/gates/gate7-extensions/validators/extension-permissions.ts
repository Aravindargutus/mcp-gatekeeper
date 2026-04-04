import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

const BROAD_PERMISSIONS = [
  { pattern: /^\*$/, reason: "Wildcard grants all permissions" },
  { pattern: /^filesystem:\*$/, reason: "Full filesystem access" },
  { pattern: /^network:\*$/, reason: "Unrestricted network access" },
  { pattern: /^system:\*$/, reason: "Full system access" },
  { pattern: /^admin$/i, reason: "Admin-level access" },
  { pattern: /^full[_-]?access$/i, reason: "Full access scope" },
];

export class ExtensionPermissionsValidator implements IValidator {
  readonly name = "extension-permissions";
  readonly description = "Checks for overly broad or wildcard permissions in manifest";
  readonly dependencies = ["extension-manifest"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (!ctx.extensionPath) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No extension path", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    const manifest = JSON.parse(readFileSync(join(ctx.extensionPath, "manifest.json"), "utf-8"));
    const permissions = manifest.permissions as string[] | undefined;

    if (!permissions || !Array.isArray(permissions)) {
      return { validatorName: this.name, severity: Severity.PASS, message: "No permissions declared", details: {}, durationMs: 0, evidence: [] };
    }

    for (const perm of permissions) {
      for (const { pattern, reason } of BROAD_PERMISSIONS) {
        if (pattern.test(perm)) {
          evidence.push(`Permission "${perm}": ${reason}`);
        }
      }
    }

    if (permissions.length > 10) {
      evidence.push(`Extension requests ${permissions.length} permissions — consider reducing scope`);
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} permission concern(s)` : `${permissions.length} permission(s) look reasonable`,
      details: { permissionCount: permissions.length },
      durationMs: 0,
      evidence,
    };
  }
}
