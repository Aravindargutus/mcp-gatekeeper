import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

export class ResourceMetadataValidator implements IValidator {
  readonly name = "resource-metadata";
  readonly description = "Validates resource definitions have required fields (uri, name, mimeType)";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.resources.length === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "Server exposes no resources", details: {}, durationMs: 0, evidence: [] };
    }

    const evidence: string[] = [];
    for (const resource of ctx.resources) {
      const name = resource.name as string ?? "unnamed";

      if (!resource.uri || typeof resource.uri !== "string") {
        evidence.push(`Resource "${name}": missing or invalid 'uri' field`);
      }
      if (!resource.name || typeof resource.name !== "string") {
        evidence.push(`Resource (uri: ${resource.uri}): missing 'name' field`);
      }
      if (resource.mimeType && typeof resource.mimeType !== "string") {
        evidence.push(`Resource "${name}": 'mimeType' is not a string`);
      }
    }

    // Check URI uniqueness
    const uris = ctx.resources.map((r) => r.uri as string).filter(Boolean);
    const duplicates = uris.filter((u, i) => uris.indexOf(u) !== i);
    if (duplicates.length > 0) {
      evidence.push(`Duplicate resource URIs: ${[...new Set(duplicates)].join(", ")}`);
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.FAIL : Severity.PASS,
      message: evidence.length > 0 ? `${evidence.length} resource metadata issue(s)` : `${ctx.resources.length} resources validated`,
      details: { resourceCount: ctx.resources.length },
      durationMs: 0,
      evidence,
    };
  }
}
