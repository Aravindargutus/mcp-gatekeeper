import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

const WRITE_OP_PATTERN = /\b(write|create|update|delete|send|post|put|patch|insert|modify|remove|execute|run|trigger)\b/i;

export class RateLimitValidator implements IValidator {
  readonly name = "rate-limit";
  readonly description = "Checks for rate limiting annotations on tools that perform write operations";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const tool of ctx.toolDefinitions) {
      const text = `${tool.name} ${tool.description ?? ""}`;
      const isWriteOp = WRITE_OP_PATTERN.test(text);

      if (!isWriteOp) continue;

      // Check annotations for rate limiting info
      const hasRateLimitAnnotation =
        tool.annotations?.rateLimit !== undefined ||
        tool.annotations?.rateLimited !== undefined ||
        tool.annotations?.throttle !== undefined;

      // Check description for rate limit mentions
      const descMentionsRateLimit =
        tool.description &&
        /\b(rate.?limit|throttl|quota|burst|cool.?down)/i.test(
          tool.description
        );

      if (!hasRateLimitAnnotation && !descMentionsRateLimit) {
        evidence.push(
          `Tool "${tool.name}": write operation without rate limiting information`
        );
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} write tool(s) without rate limiting information`
          : "Write operations have rate limiting information",
      details: { issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }
}
