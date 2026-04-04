import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import { toolChainDiscoveryPrompt } from "../prompts.js";

export class ToolChainDiscoveryValidator implements IValidator {
  readonly name = "tool-chain-discovery";
  readonly description = "Uses LLM to identify tool chains, gaps, and redundancies in the tool ecosystem";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.toolDefinitions.length === 0) {
      return {
        validatorName: this.name,
        severity: Severity.SKIP,
        message: "No tools to analyze",
        details: {},
        durationMs: 0,
        evidence: [],
      };
    }

    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const judge = new LLMJudge({ ...llmConfig, maxTokens: 2048 });

    const tools = ctx.toolDefinitions.map((t) => ({
      name: t.name,
      description: t.description ?? "No description",
    }));

    // For large tool sets, only analyze first 30 to stay within token limits
    const toolsToAnalyze = tools.slice(0, 30);
    const prompt = toolChainDiscoveryPrompt(toolsToAnalyze);
    const verdict = await judge.evaluate(prompt);

    const evidence: string[] = [];
    if (verdict.reasoning) {
      evidence.push(verdict.reasoning);
    }

    return {
      validatorName: this.name,
      severity: verdict.verdict === "pass" ? Severity.PASS : verdict.verdict === "warn" ? Severity.WARN : Severity.FAIL,
      message: `Tool ecosystem completeness: ${verdict.score}/5 (${toolsToAnalyze.length} tools analyzed)`,
      details: { score: verdict.score, toolsAnalyzed: toolsToAnalyze.length },
      durationMs: 0,
      evidence,
    };
  }
}
