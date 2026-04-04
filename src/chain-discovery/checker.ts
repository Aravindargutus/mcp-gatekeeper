import { KnowledgeBase, type ChainTool } from "./knowledge-base.js";
import { LLMJudge, type LLMJudgeConfig } from "../gates/gate4-semantic/llm-judge.js";
import { logger } from "../utils/logger.js";

export interface CheckResult {
  valid: boolean;
  resolvedCount: number;
  missingCount: number;
  selfHealedCount: number;
  errors: string[];
}

/**
 * Checker — validates that the knowledge base has all required IDs
 * and self-heals when the Extractor returned ambiguous candidates.
 *
 * Self-healing: When the Extractor found multiple candidates (Tier 3),
 * the Checker asks the LLM: "Given this tool's purpose and the response,
 * which field is the correct one?" — then caches that pattern.
 */
export class ChainChecker {
  constructor(
    private readonly kb: KnowledgeBase,
    private readonly llmConfig?: Partial<LLMJudgeConfig>
  ) {}

  async check(): Promise<CheckResult> {
    const result: CheckResult = {
      valid: true,
      resolvedCount: 0,
      missingCount: 0,
      selfHealedCount: 0,
      errors: [],
    };

    const allTools = this.kb.getToolsInOrder();

    for (const tool of allTools) {
      if (tool.classification === "safe") {
        // Verify that tools in higher layers have their dependency data
        for (const dep of tool.dependencies) {
          if (this.kb.hasSeedValue(dep.sourceFieldHint)) {
            result.resolvedCount++;
          } else {
            result.missingCount++;
            result.errors.push(
              `Tool "${tool.name}" needs "${dep.sourceFieldHint}" from "${dep.sourceToolName}" — not found in knowledge base`
            );
          }
        }

        // Verify that this tool's produced values are in the knowledge base
        for (const field of tool.produces) {
          if (this.kb.hasSeedValue(field)) {
            result.resolvedCount++;
          } else {
            // Check if extraction pattern was tier 3 (ambiguous)
            const pattern = this.kb.getExtractionPattern(tool.name);
            if (pattern && pattern.tier === 3) {
              // Self-heal: ask LLM to resolve ambiguity
              const healed = await this.selfHeal(tool, field);
              if (healed) {
                result.selfHealedCount++;
                result.resolvedCount++;
              } else {
                result.missingCount++;
                result.errors.push(
                  `Tool "${tool.name}" should produce "${field}" — extraction ambiguous, LLM could not resolve`
                );
              }
            } else {
              // Not ambiguous, just missing — tool might not have been called or returned empty
              const toolError = this.kb.getErrors().find((e) => e.tool === tool.name);
              if (toolError) {
                result.errors.push(
                  `Tool "${tool.name}" failed: ${toolError.message} — downstream tools may be affected`
                );
              }
            }
          }
        }
      }
    }

    result.valid = result.missingCount === 0;

    logger.info(
      `Checker: ${result.resolvedCount} resolved, ${result.missingCount} missing, ${result.selfHealedCount} self-healed`
    );

    return result;
  }

  /** Ask LLM to resolve ambiguous extraction */
  private async selfHeal(tool: ChainTool, fieldHint: string): Promise<boolean> {
    try {
      const judge = new LLMJudge({ ...this.llmConfig, maxTokens: 256 });

      const prompt = `A tool named "${tool.name}" (${tool.classification}) returned a response with multiple fields that could be "${fieldHint}".

The tool produces these values: ${JSON.stringify(tool.produces)}
The tool's dependencies suggest it returns: ${fieldHint}

Which JSON path is most likely the "${fieldHint}"? Respond with ONLY the value, nothing else.`;

      const verdict = await judge.evaluate(prompt);
      if (verdict.raw && verdict.raw.trim().length > 0) {
        this.kb.setSeedValue(fieldHint, verdict.raw.trim());
        logger.debug(`Checker: self-healed "${fieldHint}" for tool "${tool.name}"`);
        return true;
      }
    } catch (err) {
      logger.warn(`Checker: self-heal failed for "${tool.name}.${fieldHint}": ${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }
}
