import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { PLACEHOLDER_PATTERNS } from "../../../utils/patterns.js";

export class DescriptionQualityValidator implements IValidator {
  readonly name = "description-quality";
  readonly description = "Checks tool descriptions exist, have adequate length, and are not placeholders";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let hasWarn = false;

    const gateConfig = ctx.config.gates[1]?.validators?.["description-quality"];
    const minLength = (gateConfig as Record<string, unknown>)?.minLength as number ?? 20;
    const maxLength = (gateConfig as Record<string, unknown>)?.maxLength as number ?? 2000;

    for (const tool of ctx.toolDefinitions) {
      // Check description exists
      if (!tool.description || tool.description.trim().length === 0) {
        evidence.push(`Tool "${tool.name}": missing or empty description`);
        hasWarn = true;
        continue;
      }

      const desc = tool.description.trim();

      // Check minimum length
      if (desc.length < minLength) {
        evidence.push(
          `Tool "${tool.name}": description too short (${desc.length} chars, min: ${minLength})`
        );
        hasWarn = true;
      }

      // Check maximum length
      if (desc.length > maxLength) {
        evidence.push(
          `Tool "${tool.name}": description too long (${desc.length} chars, max: ${maxLength})`
        );
        hasWarn = true;
      }

      // Check for placeholder patterns
      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(desc)) {
          evidence.push(
            `Tool "${tool.name}": description contains placeholder text matching ${pattern.source}`
          );
          hasWarn = true;
          break;
        }
      }

      // Check description has at least one verb (indicates it describes an action)
      const hasVerb = /\b(get|set|create|update|delete|list|search|find|read|write|send|fetch|retrieve|add|remove|modify|check|validate|process|generate|convert|export|import|run|execute|start|stop|enable|disable|configure|manage)\b/i.test(desc);
      if (!hasVerb) {
        evidence.push(
          `Tool "${tool.name}": description lacks an action verb — may not clearly describe what the tool does`
        );
        hasWarn = true;
      }

      // Check parameter descriptions within inputSchema
      const properties = tool.inputSchema?.properties as Record<string, Record<string, unknown>> | undefined;
      if (properties) {
        for (const [paramName, paramSchema] of Object.entries(properties)) {
          if (!paramSchema.description || (typeof paramSchema.description === "string" && paramSchema.description.trim().length === 0)) {
            evidence.push(
              `Tool "${tool.name}": parameter "${paramName}" has no description`
            );
            hasWarn = true;
          }
        }
      }
    }

    return {
      validatorName: this.name,
      severity: hasWarn ? Severity.WARN : Severity.PASS,
      message: hasWarn
        ? `${evidence.length} description quality issue(s) found`
        : "All tool descriptions meet quality standards",
      details: { issueCount: evidence.length, minLength, maxLength },
      durationMs: 0,
      evidence,
    };
  }
}
