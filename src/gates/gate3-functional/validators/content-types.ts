import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

const VALID_CONTENT_TYPES = ["text", "image", "audio", "resource"];

export class ContentTypesValidator implements IValidator {
  readonly name = "content-types";
  readonly description = "Validates content type handling in tool responses (text, image, audio, resources)";
  readonly dependencies = ["tool-invocation"];

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    const contentTypesFound = new Set<string>();

    for (const [toolName, result] of ctx.invocationResults.entries()) {
      if (!result.content || !Array.isArray(result.content)) continue;

      for (let i = 0; i < result.content.length; i++) {
        const item = result.content[i];
        contentTypesFound.add(item.type);

        switch (item.type) {
          case "text":
            if (typeof item.text !== "string") {
              evidence.push(`Tool "${toolName}": content[${i}] has type "text" but missing/invalid text field`);
            }
            break;
          case "image":
            if (!item.data || typeof item.data !== "string") {
              evidence.push(`Tool "${toolName}": content[${i}] has type "image" but missing data field`);
            }
            if (!item.mimeType) {
              evidence.push(`Tool "${toolName}": content[${i}] has type "image" but missing mimeType`);
            }
            break;
          case "audio":
            if (!item.data || typeof item.data !== "string") {
              evidence.push(`Tool "${toolName}": content[${i}] has type "audio" but missing data field`);
            }
            if (!item.mimeType) {
              evidence.push(`Tool "${toolName}": content[${i}] has type "audio" but missing mimeType`);
            }
            break;
          case "resource":
            if (!item.resource) {
              evidence.push(`Tool "${toolName}": content[${i}] has type "resource" but missing resource field`);
            }
            break;
          default:
            if (!VALID_CONTENT_TYPES.includes(item.type)) {
              evidence.push(`Tool "${toolName}": content[${i}] has unknown type "${item.type}"`);
            }
        }
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} content type issue(s) found`
          : `Content types validated (types seen: ${[...contentTypesFound].join(", ") || "none"})`,
      details: { contentTypesFound: [...contentTypesFound], issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }
}
