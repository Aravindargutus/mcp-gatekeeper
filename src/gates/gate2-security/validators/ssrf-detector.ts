import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { PRIVATE_IP_PATTERNS, DANGEROUS_SCHEMES } from "../../../utils/patterns.js";

export class SSRFDetectorValidator implements IValidator {
  readonly name = "ssrf-detector";
  readonly description = "Detects SSRF risks in URL parameters and default values";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const tool of ctx.toolDefinitions) {
      const properties = tool.inputSchema?.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!properties) continue;

      for (const [paramName, paramSchema] of Object.entries(properties)) {
        // Check for URL-type parameters
        const isUrlParam =
          paramSchema.format === "uri" ||
          paramSchema.format === "url" ||
          /\burl\b/i.test(paramName) ||
          /\buri\b/i.test(paramName) ||
          /\bendpoint\b/i.test(paramName) ||
          /\bhref\b/i.test(paramName) ||
          (typeof paramSchema.description === "string" &&
            /\burl\b/i.test(paramSchema.description));

        if (isUrlParam) {
          // Check if there's any restriction on the URL
          if (!paramSchema.pattern && !paramSchema.enum) {
            evidence.push(
              `Tool "${tool.name}", param "${paramName}": URL parameter without pattern/enum restriction — SSRF risk`
            );
          }
        }

        // Check default values for private IPs or dangerous schemes
        if (typeof paramSchema.default === "string") {
          this.checkUrlValue(
            paramSchema.default,
            `Tool "${tool.name}", param "${paramName}" default`,
            evidence
          );
        }

        // Check examples
        if (Array.isArray(paramSchema.examples)) {
          for (const example of paramSchema.examples) {
            if (typeof example === "string") {
              this.checkUrlValue(
                example,
                `Tool "${tool.name}", param "${paramName}" example`,
                evidence
              );
            }
          }
        }
      }

      // Check description for hardcoded URLs
      if (tool.description) {
        const urlMatches = tool.description.match(/https?:\/\/[^\s)]+/g) ?? [];
        for (const url of urlMatches) {
          this.checkUrlValue(
            url,
            `Tool "${tool.name}" description`,
            evidence
          );
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.FAIL : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} SSRF risk(s) detected`
          : "No SSRF risks found",
      details: { issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }

  private checkUrlValue(value: string, context: string, evidence: string[]): void {
    // Check dangerous schemes
    for (const scheme of DANGEROUS_SCHEMES) {
      if (value.toLowerCase().startsWith(scheme)) {
        evidence.push(`${context}: uses dangerous scheme "${scheme}"`);
        return;
      }
    }

    // Extract hostname and check against private IP patterns
    try {
      const url = new URL(value);
      const hostname = url.hostname;
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(hostname)) {
          evidence.push(
            `${context}: points to private/internal address "${hostname}"`
          );
          return;
        }
      }

      // Check for cloud metadata endpoints
      if (
        hostname === "169.254.169.254" ||
        hostname === "metadata.google.internal" ||
        hostname === "metadata.azure.com"
      ) {
        evidence.push(
          `${context}: points to cloud metadata endpoint "${hostname}"`
        );
      }
    } catch {
      // Not a valid URL, skip
    }
  }
}
