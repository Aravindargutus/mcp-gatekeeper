import type { IValidator } from "../../../core/interfaces.js";
import type { ValidationContext } from "../../../core/context.js";
import type { ValidatorResult } from "../../../core/types.js";
import { Severity } from "../../../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../llm-judge.js";
import type { TranscriptRecorder } from "../transcript.js";
import { toolChainDiscoveryPrompt } from "../prompts.js";
import { logger } from "../../../utils/logger.js";

export class ToolChainDiscoveryValidator implements IValidator {
  readonly name = "tool-chain-discovery";
  readonly description = "Uses LLM to identify tool chains, gaps, and redundancies in the tool ecosystem";

  async validate(ctx: ValidationContext): Promise<ValidatorResult> {
    if (ctx.toolDefinitions.length === 0) {
      return { validatorName: this.name, severity: Severity.SKIP, message: "No tools to analyze", details: {}, durationMs: 0, evidence: [] };
    }

    const llmConfig = (ctx.config.gates[4]?.validators?.["llm"] ?? {}) as Partial<LLMJudgeConfig>;
    const trials = ctx.trials ?? 1;
    const recorder = ctx.transcriptRecorder as TranscriptRecorder | undefined;
    const judge = new LLMJudge({ ...llmConfig, maxTokens: 2048 });

    const tools = ctx.toolDefinitions.slice(0, 30).map((t) => ({
      name: t.name, description: t.description ?? "No description",
    }));

    const prompt = toolChainDiscoveryPrompt(tools);

    try {
      const startMs = Date.now();
      const result = await judge.evaluateWithTrials(prompt, trials);
      recorder?.recordTrials("__ecosystem__", this.name, prompt, result, Date.now() - startMs);

      const evidence: string[] = [];
      if (result.trials[0]?.reasoning) evidence.push(result.trials[0].reasoning);
      for (const fix of result.fixes.slice(0, 5)) evidence.push(`FIX: ${fix}`);

      return {
        validatorName: this.name,
        severity: result.consensusVerdict === "pass" ? Severity.PASS : result.consensusVerdict === "warn" ? Severity.WARN : Severity.FAIL,
        message: `Tool ecosystem completeness: ${result.medianScore}/5 (${tools.length} tools analyzed)`,
        details: { score: result.medianScore, toolsAnalyzed: tools.length },
        durationMs: 0, evidence,
        partialCredit: result.medianScore / 5,
      };
    } catch (err) {
      logger.error(`Tool chain discovery failed: ${err instanceof Error ? err.message : String(err)}`);
      return {
        validatorName: this.name, severity: Severity.ERROR,
        message: `Tool chain discovery failed: ${err instanceof Error ? err.message : String(err)}`,
        details: {}, durationMs: 0, evidence: [],
      };
    }
  }
}
