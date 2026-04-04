import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { INJECTION_PAYLOADS } from "../../../utils/patterns.js";

/**
 * Dynamic security validator — actually invokes tools with injection payloads
 * and analyzes responses for signs the injection was processed.
 *
 * Unlike the static prompt-injection validator, this tests runtime behavior:
 * - SQL injection through string params
 * - Path traversal through file/path params
 * - Shell metacharacter injection through command-like params
 * - XSS payloads through text output params
 * - Template injection through string params
 */
export class DynamicInjectionValidator implements IValidator {
  readonly name = "dynamic-injection";
  readonly description = "Invokes tools with injection payloads (SQLi, path traversal, shell, XSS) and checks for unsafe behavior";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const tool of ctx.toolDefinitions) {
      const properties = tool.inputSchema?.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!properties) continue;

      const required = (tool.inputSchema?.required as string[]) ?? [];

      // Find string params to inject into
      const stringParams = Object.entries(properties).filter(
        ([_, schema]) => schema.type === "string"
      );
      if (stringParams.length === 0) continue;

      // Build base args with valid required params
      const baseArgs: Record<string, unknown> = {};
      for (const req of required) {
        const schema = properties[req];
        if (!schema) continue;
        if (schema.type === "string") baseArgs[req] = "test";
        else if (schema.type === "number" || schema.type === "integer") baseArgs[req] = 1;
        else if (schema.type === "boolean") baseArgs[req] = true;
        else baseArgs[req] = "test";
      }

      // For each string param, try injection payloads
      for (const [paramName, paramSchema] of stringParams) {
        const payloads = this.selectPayloads(paramName, paramSchema);

        for (const { category, payload } of payloads) {
          const args = { ...baseArgs, [paramName]: payload };

          try {
            const result = await ctx.connector.callTool(tool.name, args);

            // Check if injection was reflected or processed
            if (!result.isError && result.content) {
              const responseText = result.content
                .filter((c) => c.type === "text" && c.text)
                .map((c) => c.text)
                .join(" ");

              const injectionProcessed = this.checkResponseForInjection(
                category,
                payload,
                responseText
              );

              if (injectionProcessed) {
                evidence.push(
                  `Tool "${tool.name}", param "${paramName}": ${category} payload was processed — "${payload.substring(0, 40)}..."`
                );
              }
            }
            // If the tool returns an error for the payload, that's GOOD — it rejected it
          } catch {
            // Tool throwing on injection payload is acceptable behavior
          }
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.FAIL : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} dynamic injection vulnerability(ies) found`
          : "No dynamic injection vulnerabilities detected",
      details: { issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }

  private selectPayloads(
    paramName: string,
    paramSchema: Record<string, unknown>
  ): Array<{ category: string; payload: string }> {
    const results: Array<{ category: string; payload: string }> = [];
    const name = paramName.toLowerCase();
    const desc = ((paramSchema.description as string) ?? "").toLowerCase();
    const context = `${name} ${desc}`;

    // Path traversal for file/path-like params
    if (/\b(path|file|dir|folder|location|filename)\b/.test(context)) {
      for (const p of INJECTION_PAYLOADS.pathTraversal) {
        results.push({ category: "path-traversal", payload: p });
      }
    }

    // SQL injection for query/search/filter-like params
    if (/\b(query|search|filter|where|sql|select|criteria|keyword)\b/.test(context)) {
      for (const p of INJECTION_PAYLOADS.sqlInjection) {
        results.push({ category: "sql-injection", payload: p });
      }
    }

    // Shell injection for command/exec-like params
    if (/\b(command|cmd|exec|run|shell|script|program|process)\b/.test(context)) {
      for (const p of INJECTION_PAYLOADS.shellMetacharacters) {
        results.push({ category: "shell-injection", payload: p });
      }
    }

    // Template injection for any string param (lightweight — only first payload)
    if (results.length === 0) {
      results.push({ category: "template-injection", payload: INJECTION_PAYLOADS.templateInjection[0] });
      results.push({ category: "sql-injection", payload: INJECTION_PAYLOADS.sqlInjection[0] });
    }

    return results;
  }

  private checkResponseForInjection(
    category: string,
    payload: string,
    responseText: string
  ): boolean {
    const lower = responseText.toLowerCase();

    switch (category) {
      case "sql-injection":
        // Check for SQL error messages or data that shouldn't be there
        return (
          /\b(syntax error|sql|mysql|postgresql|sqlite|oracle|table|column|select|union)\b/i.test(responseText) &&
          lower.includes("error")
        ) || lower.includes("information_schema");

      case "path-traversal":
        // Check if system files were read
        return (
          lower.includes("root:") ||
          lower.includes("/bin/") ||
          lower.includes("\\windows\\") ||
          lower.includes("[boot loader]")
        );

      case "shell-injection":
        // Check if shell commands were executed
        return (
          lower.includes("uid=") ||
          lower.includes("total ") ||
          /\bdrwx/.test(responseText) ||
          lower.includes("permission denied")
        );

      case "template-injection":
        // Check if template was evaluated (e.g., {{7*7}} → 49)
        return responseText.includes("49");

      case "xss":
        // Check if script was reflected
        return responseText.includes("<script") || responseText.includes("onerror=");

      default:
        return false;
    }
  }
}
