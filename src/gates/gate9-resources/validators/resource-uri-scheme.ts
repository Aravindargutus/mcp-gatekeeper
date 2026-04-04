import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { DANGEROUS_SCHEMES, PRIVATE_IP_PATTERNS } from "../../../utils/patterns.js";

export class ResourceUriSchemeValidator implements IValidator {
  readonly name = "resource-uri-scheme";
  readonly description = "Validates resource URIs use safe schemes and don't point to internal addresses";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.resources.length === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No resources to check", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    for (const resource of ctx.resources) {
      const uri = resource.uri as string;
      if (!uri) continue;

      for (const scheme of DANGEROUS_SCHEMES) {
        if (uri.toLowerCase().startsWith(scheme)) {
          evidence.push(`Resource "${resource.name}": uses dangerous scheme "${scheme}" in URI`);
        }
      }

      try {
        const parsed = new URL(uri);
        for (const pattern of PRIVATE_IP_PATTERNS) {
          if (pattern.test(parsed.hostname)) {
            evidence.push(`Resource "${resource.name}": URI points to private address "${parsed.hostname}"`);
          }
        }
      } catch {
        // Not a URL — could be a custom scheme like "mcp://", which is fine
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.FAIL : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} resource URI concern(s)` : "All resource URIs use safe schemes",
      details: {},
      durationMs: 0,
      evidence,
    };
  }
}
