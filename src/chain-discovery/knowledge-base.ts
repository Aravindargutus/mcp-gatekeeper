import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { logger } from "../utils/logger.js";
import type { ToolDefinition } from "../core/types.js";

export type ToolClassification = "safe" | "create" | "update" | "delete" | "restore" | "destructive" | "unknown";

export interface ToolDependency {
  /** Parameter name in this tool's inputSchema */
  paramPath: string;
  /** Which tool produces this value */
  sourceToolName: string;
  /** Hint for what field to extract from the source tool's response */
  sourceFieldHint: string;
}

export interface ChainTool {
  name: string;
  classification: ToolClassification;
  layer: number;
  dependencies: ToolDependency[];
  produces: string[];
  sideEffects: boolean;
}

export interface DependencyChain {
  chainId: string;
  serviceName: string;
  tools: ChainTool[];
  rootTools: string[];
  lifecycleOrder: string[];
}

export interface KnowledgeBaseData {
  serverFingerprint: string;
  generatedAt: string;
  chains: DependencyChain[];
  seedData: Record<string, unknown>;
  createdTestIds: Array<{ tool: string; idField: string; idValue: string }>;
  extractionPatterns: Record<string, { path: string; tier: number }>;
  errors: Array<{ tool: string; reason: string; message: string }>;
  skippedTools: Array<{ tool: string; reason: string }>;
}

/**
 * KnowledgeBase — the shared state that flows through Planner → Generator → Checker → Evaluator.
 *
 * Stores:
 * - Dependency chains discovered by the Planner
 * - Real IDs extracted by the Generator
 * - Test data IDs created during write tests (for cleanup)
 * - Extraction patterns learned during execution (cached for reuse)
 */
export class KnowledgeBase {
  private data: KnowledgeBaseData;

  constructor() {
    this.data = {
      serverFingerprint: "",
      generatedAt: new Date().toISOString(),
      chains: [],
      seedData: {},
      createdTestIds: [],
      extractionPatterns: {},
      errors: [],
      skippedTools: [],
    };
  }

  /** Compute fingerprint from all tool schemas — changes only when tools change */
  static computeFingerprint(tools: ToolDefinition[]): string {
    const schemaStr = tools
      .map((t) => `${t.name}:${JSON.stringify(t.inputSchema)}`)
      .sort()
      .join("|");
    return createHash("sha256").update(schemaStr).digest("hex").substring(0, 16);
  }

  setFingerprint(fingerprint: string): void {
    this.data.serverFingerprint = fingerprint;
  }

  getFingerprint(): string {
    return this.data.serverFingerprint;
  }

  // ── Chain Management ──────────────────────────────

  setChains(chains: DependencyChain[]): void {
    this.data.chains = chains;
  }

  getChains(): DependencyChain[] {
    return this.data.chains;
  }

  getToolsInOrder(): ChainTool[] {
    const all: ChainTool[] = [];
    for (const chain of this.data.chains) {
      for (const tool of chain.tools) {
        if (!all.find((t) => t.name === tool.name)) {
          all.push(tool);
        }
      }
    }
    return all.sort((a, b) => a.layer - b.layer);
  }

  getToolsByClassification(classification: ToolClassification): ChainTool[] {
    return this.getToolsInOrder().filter((t) => t.classification === classification);
  }

  // ── Seed Data (real IDs from tool responses) ──────

  setSeedValue(key: string, value: unknown): void {
    this.data.seedData[key] = value;
    logger.debug(`KnowledgeBase: ${key} = ${JSON.stringify(value)}`);
  }

  getSeedValue(key: string): unknown {
    return this.data.seedData[key];
  }

  getAllSeedData(): Record<string, unknown> {
    return { ...this.data.seedData };
  }

  hasSeedValue(key: string): boolean {
    return key in this.data.seedData && this.data.seedData[key] != null;
  }

  // ── Created Test IDs (for cleanup tracking) ───────

  trackCreatedId(tool: string, idField: string, idValue: string): void {
    this.data.createdTestIds.push({ tool, idField, idValue });
    logger.debug(`KnowledgeBase: tracking created ${idField}=${idValue} from ${tool}`);
  }

  getCreatedIds(): Array<{ tool: string; idField: string; idValue: string }> {
    return [...this.data.createdTestIds];
  }

  // ── Extraction Patterns (cached for reuse) ────────

  setExtractionPattern(toolName: string, path: string, tier: number): void {
    this.data.extractionPatterns[toolName] = { path, tier };
  }

  getExtractionPattern(toolName: string): { path: string; tier: number } | undefined {
    return this.data.extractionPatterns[toolName];
  }

  // ── Errors & Skipped Tools ────────────────────────

  addError(tool: string, reason: string, message: string): void {
    this.data.errors.push({ tool, reason, message });
  }

  addSkippedTool(tool: string, reason: string): void {
    this.data.skippedTools.push({ tool, reason });
  }

  getErrors(): Array<{ tool: string; reason: string; message: string }> {
    return this.data.errors;
  }

  getSkippedTools(): Array<{ tool: string; reason: string }> {
    return this.data.skippedTools;
  }

  // ── Persistence (cache to disk) ───────────────────

  save(cacheDir: string): void {
    try {
      mkdirSync(cacheDir, { recursive: true });
      const filepath = join(cacheDir, "knowledge-base.json");
      writeFileSync(filepath, JSON.stringify(this.data, null, 2));
      logger.debug(`KnowledgeBase saved to ${filepath}`);
    } catch (err) {
      logger.error(`Failed to save KnowledgeBase: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  static load(cacheDir: string): KnowledgeBase | null {
    const filepath = join(cacheDir, "knowledge-base.json");
    if (!existsSync(filepath)) return null;
    try {
      const raw = JSON.parse(readFileSync(filepath, "utf-8"));
      const kb = new KnowledgeBase();
      kb.data = raw;
      return kb;
    } catch {
      return null;
    }
  }

  /** Check if cache is still valid for this tool set */
  isValid(currentFingerprint: string): boolean {
    return this.data.serverFingerprint === currentFingerprint && this.data.chains.length > 0;
  }

  toJSON(): KnowledgeBaseData {
    return { ...this.data };
  }
}
