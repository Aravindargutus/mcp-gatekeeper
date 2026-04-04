import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";

const SIDE_EFFECT_PATTERN = /\b(write|create|update|delete|send|post|put|patch|modify|remove|execute|publish|deploy|install|upload)\b/i;

export class AuthCheckValidator implements IValidator {
  readonly name = "auth-check";
  readonly description = "Checks for authentication requirements on tools with side effects";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];

    for (const tool of ctx.toolDefinitions) {
      const text = `${tool.name} ${tool.description ?? ""}`;
      const hasSideEffects = SIDE_EFFECT_PATTERN.test(text);

      if (!hasSideEffects) continue;

      // Check if annotations mention auth
      const hasAuthAnnotation =
        tool.annotations?.requiresAuth !== undefined ||
        tool.annotations?.authentication !== undefined ||
        tool.annotations?.authorization !== undefined ||
        tool.annotations?.scope !== undefined;

      // Check description for auth mentions
      const descMentionsAuth =
        tool.description &&
        /\b(auth(entication|orization)?|token|credential|api.?key|oauth|permission|scope|signed|verified)\b/i.test(
          tool.description
        );

      if (!hasAuthAnnotation && !descMentionsAuth) {
        evidence.push(
          `Tool "${tool.name}": has side effects but no authentication/authorization information`
        );
      }
    }

    return {
      validatorName: this.name,
      severity: evidence.length > 0 ? Severity.WARN : Severity.PASS,
      message:
        evidence.length > 0
          ? `${evidence.length} tool(s) with side effects lack auth information`
          : "Tools with side effects have authentication information",
      details: { issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }
}
