import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { TOOL_NAME_REGEX } from "../../../utils/patterns.js";

export class ToolNameValidator implements IValidator {
  readonly name = "tool-name";
  readonly description = "Validates tool names match MCP spec: 1-128 chars, [A-Za-z0-9_.-]";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    const evidence: string[] = [];
    let hasFail = false;

    for (const tool of ctx.toolDefinitions) {
      if (!tool.name) {
        evidence.push(`Tool has empty or missing name`);
        hasFail = true;
        continue;
      }

      if (!TOOL_NAME_REGEX.test(tool.name)) {
        evidence.push(
          `Tool "${tool.name}" has invalid name. Must match ${TOOL_NAME_REGEX.source}`
        );
        hasFail = true;
      }

      if (tool.name.length > 128) {
        evidence.push(
          `Tool "${tool.name}" name exceeds 128 chars (${tool.name.length})`
        );
        hasFail = true;
      }
    }

    // Check for duplicate names
    const names = ctx.toolDefinitions.map((t) => t.name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
      evidence.push(`Duplicate tool names found: ${[...new Set(duplicates)].join(", ")}`);
      hasFail = true;
    }

    if (ctx.toolDefinitions.length === 0) {
      return {
        validatorName: this.name,
        severity: Severity.WARN,
        message: "No tools found on the server",
        details: { toolCount: 0 },
        durationMs: 0,
        evidence: ["Server returned 0 tools"],
      };
    }

    return {
      validatorName: this.name,
      severity: hasFail ? Severity.FAIL : Severity.PASS,
      message: hasFail
        ? `${evidence.length} tool name issue(s) found`
        : `All ${ctx.toolDefinitions.length} tool names are valid`,
      details: { toolCount: ctx.toolDefinitions.length, issueCount: evidence.length },
      durationMs: 0,
      evidence,
    };
  }
}
