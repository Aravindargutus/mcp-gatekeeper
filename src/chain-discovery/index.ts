import type { IMCPConnector } from "../core/interfaces.js";
import type { ToolDefinition } from "../core/types.js";
import type { LLMJudgeConfig } from "../gates/gate4-semantic/llm-judge.js";
import { KnowledgeBase } from "./knowledge-base.js";
import { discoverChains } from "./planner.js";
import { ChainGenerator } from "./generator.js";
import { ChainChecker } from "./checker.js";
import { logger } from "../utils/logger.js";

export { KnowledgeBase } from "./knowledge-base.js";
export { extractFromResponse } from "./extractor.js";
export { discoverChains } from "./planner.js";
export { ChainGenerator } from "./generator.js";
export { ChainChecker } from "./checker.js";

export interface ChainDiscoveryOptions {
  cacheDir?: string;
  llmConfig?: Partial<LLMJudgeConfig>;
  enableWriteTests?: boolean;
}

/**
 * Full chain discovery pipeline:
 *   1. PLANNER: Discover dependency chains from tool schemas (LLM, cached)
 *   2. GENERATOR: Execute read chains to populate knowledge base
 *   3. CHECKER: Validate all IDs extracted, self-heal if ambiguous
 *   4. Optionally: Execute write lifecycle tests (create → update → delete → restore)
 *
 * Returns a populated KnowledgeBase that Gate 3+4 validators can use
 * for real data instead of dummy sample values.
 */
export async function runChainDiscovery(
  connector: IMCPConnector,
  tools: ToolDefinition[],
  options: ChainDiscoveryOptions = {}
): Promise<KnowledgeBase> {
  const cacheDir = options.cacheDir ?? ".mcpqa";
  const currentFingerprint = KnowledgeBase.computeFingerprint(tools);

  // Try to load cached knowledge base
  const cached = KnowledgeBase.load(cacheDir);
  if (cached && cached.isValid(currentFingerprint)) {
    logger.info(`Chain discovery: using cached knowledge base (fingerprint matches)`);
    return cached;
  }

  // ── Phase 1: PLANNER ──────────────────────────────
  logger.info("Chain discovery: Phase 1 — Planner (LLM analyzing schemas)");
  const kb = new KnowledgeBase();
  kb.setFingerprint(currentFingerprint);

  const chains = await discoverChains(tools, options.llmConfig);
  kb.setChains(chains);

  // Seed inferred values from the Planner's Phase 3
  const inferredValues = (chains as any).__inferredValues as Record<string, string[]> | undefined;
  if (inferredValues) {
    for (const [paramName, values] of Object.entries(inferredValues)) {
      if (values.length > 0 && !kb.hasSeedValue(paramName)) {
        kb.setSeedValue(paramName, values[0]); // Use first inferred value
        logger.debug(`Seeded inferred value: ${paramName} = ${values[0]}`);
      }
    }
  }

  // ── Phase 2: GENERATOR (read phase) ───────────────
  logger.info("Chain discovery: Phase 2 — Generator (executing read tools)");
  const generator = new ChainGenerator(connector, tools, kb);
  await generator.executeReadChains();

  // ── Phase 3: CHECKER ──────────────────────────────
  logger.info("Chain discovery: Phase 3 — Checker (validating knowledge base)");
  const checker = new ChainChecker(kb, options.llmConfig);
  const checkResult = await checker.check();

  if (!checkResult.valid) {
    logger.warn(`Chain discovery: ${checkResult.missingCount} missing value(s) — some tools may use sample data`);
    for (const err of checkResult.errors.slice(0, 5)) {
      logger.warn(`  ${err}`);
    }
  }

  // ── Phase 4: WRITE TESTS (opt-in) ────────────────
  if (options.enableWriteTests) {
    logger.info("Chain discovery: Phase 4 — Generator (write lifecycle tests)");
    try {
      await generator.executeWriteChains();
    } finally {
      // Always attempt cleanup, even if write tests crash
      logger.info("Chain discovery: Cleanup — removing test data");
      await generator.cleanupTestData();
    }
  }

  // Cache for next run
  kb.save(cacheDir);
  logger.info(
    `Chain discovery complete: ${Object.keys(kb.getAllSeedData()).length} IDs extracted, ` +
    `${kb.getErrors().length} errors, ${kb.getSkippedTools().length} skipped`
  );

  return kb;
}
