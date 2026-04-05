import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { SECRET_PATTERNS } from "../../../utils/patterns.js";

export class SecretScannerValidator implements IValidator {
  readonly name = "secret-scanner";
  readonly description = "Scans tool definitions for exposed secrets, API keys, and credentials";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const tool of ctx.toolDefinitions) {
      // Serialize the entire tool definition to scan all fields
      const fullText = JSON.stringify(tool.raw);

      for (const { name, pattern } of SECRET_PATTERNS) {
        const match = fullText.match(pattern);
        if (match) {
          // Redact the matched value for evidence
          const redacted =
            match[0].length > 8
              ? match[0].substring(0, 4) + "****" + match[0].slice(-4)
              : "****";
          evidence.push(
            `Tool "${tool.name}": potential ${name} found (${redacted})`
          );
        }
      }

      // Check for high-entropy strings (potential secrets)
      const stringValues = this.extractStringValues(tool.raw);
      for (const { path, value } of stringValues) {
        // Skip well-known non-secret high-entropy values
        if (this.isKnownSafe(path, value)) continue;
        if (value.length >= 20 && this.isHighEntropy(value)) {
          evidence.push(
            `Tool "${tool.name}", ${path}: high-entropy string detected (possible secret)`
          );
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.FAIL : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} potential secret(s) found in tool definitions`
          : "No secrets detected",
      details: { issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }

  private extractStringValues(
    obj: unknown,
    path = ""
  ): Array<{ path: string; value: string }> {
    const results: Array<{ path: string; value: string }> = [];

    if (typeof obj === "string") {
      results.push({ path, value: obj });
    } else if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        results.push(...this.extractStringValues(item, `${path}[${i}]`));
      });
    } else if (obj && typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        // Skip description fields — they're expected to have varied content
        if (key === "description" || key === "name" || key === "title") continue;
        // Skip enum arrays — they're declared public constants, not secrets
        if (key === "enum" && Array.isArray(value)) continue;
        results.push(...this.extractStringValues(value, path ? `${path}.${key}` : key));
      }
    }

    return results;
  }

  private isKnownSafe(path: string, value: string): boolean {
    // JSON Schema $schema URIs
    if (path.endsWith("$schema") || path.endsWith(".$schema")) return true;
    if (value.startsWith("https://json-schema.org/")) return true;
    if (value.startsWith("http://json-schema.org/")) return true;
    // Standard format strings
    if (/^(date-time|date|time|email|uri|hostname|ipv[46])$/.test(value)) return true;
    // UUIDs
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return true;
    return false;
  }

  private isHighEntropy(str: string): boolean {
    // Shannon entropy calculation
    const freq = new Map<string, number>();
    for (const char of str) {
      freq.set(char, (freq.get(char) ?? 0) + 1);
    }

    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / str.length;
      entropy -= p * Math.log2(p);
    }

    // Threshold: typical secrets have entropy > 4.0 bits per character
    return entropy > 4.0;
  }
}
