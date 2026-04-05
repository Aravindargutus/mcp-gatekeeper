import type { IMCPConnector } from "../core/interfaces.js";
import type { ToolDefinition, ToolCallResult } from "../core/types.js";
import { KnowledgeBase, type ChainTool, type DependencyChain } from "./knowledge-base.js";
import { extractFromResponse, unwrapFirstElement } from "./extractor.js";
import { logger } from "../utils/logger.js";

const TEST_PREFIX = "MCPQA_TEST_";

/**
 * Generator — executes tool chains in dependency order.
 *
 * Phase 1 (READ): Calls safe tools to populate knowledge base with real IDs.
 * Phase 2 (WRITE): Creates test data, tests lifecycle, cleans up.
 *
 * Only touches data it creates (prefixed with MCPQA_TEST_).
 */
export class ChainGenerator {
  constructor(
    private readonly connector: IMCPConnector,
    private readonly tools: ToolDefinition[],
    private readonly kb: KnowledgeBase
  ) {}

  /** Phase 1: Execute read-only tools by layer, extract real IDs */
  async executeReadChains(): Promise<void> {
    const safeTools = this.kb.getToolsByClassification("safe");
    const maxLayer = Math.max(...safeTools.map((t) => t.layer), 0);

    for (let layer = 0; layer <= maxLayer; layer++) {
      const layerTools = safeTools.filter((t) => t.layer === layer);
      logger.info(`Generator: executing Layer ${layer} (${layerTools.length} safe tools)`);

      for (const chainTool of layerTools) {
        await this.executeSafeTool(chainTool);
      }
    }
  }

  /** Phase 2: Execute write lifecycle per chain (create → update → delete → restore → cleanup) */
  async executeWriteChains(): Promise<void> {
    for (const chain of this.kb.getChains()) {
      const createTools = chain.tools.filter((t) => t.classification === "create");
      const updateTools = chain.tools.filter((t) => t.classification === "update");
      const deleteTools = chain.tools.filter((t) => t.classification === "delete");
      const restoreTools = chain.tools.filter((t) => t.classification === "restore");

      if (createTools.length === 0) {
        logger.debug(`Generator: chain "${chain.chainId}" has no create tools — skipping write tests`);
        continue;
      }

      logger.info(`Generator: write lifecycle for chain "${chain.chainId}"`);

      // Step A: CREATE test data
      for (const tool of createTools) {
        await this.executeCreateTool(tool, chain);
      }

      // Step B: UPDATE test data
      for (const tool of updateTools) {
        await this.executeWriteTool(tool, "update");
      }

      // Step C: DELETE test data
      for (const tool of deleteTools) {
        await this.executeWriteTool(tool, "delete");
      }

      // Step D: RESTORE (if tool exists)
      for (const tool of restoreTools) {
        await this.executeWriteTool(tool, "restore");
      }

      // Step E: FINAL CLEANUP — delete the test data permanently
      for (const tool of deleteTools) {
        await this.executeWriteTool(tool, "final-cleanup");
      }
    }
  }

  /** Cleanup any test data that was created (safety net) */
  async cleanupTestData(): Promise<void> {
    const created = this.kb.getCreatedIds();
    if (created.length === 0) return;

    logger.info(`Generator: cleaning up ${created.length} test record(s)`);
    for (const record of created) {
      try {
        // Find the delete tool for this chain
        const chains = this.kb.getChains();
        for (const chain of chains) {
          const deleteTool = chain.tools.find((t) => t.classification === "delete");
          if (deleteTool) {
            const args = this.buildArgsFromKnowledgeBase(deleteTool);
            await this.connector.callTool(deleteTool.name, args);
            logger.debug(`Cleanup: deleted ${record.idField}=${record.idValue}`);
          }
        }
      } catch (err) {
        logger.warn(`Cleanup failed for ${record.idField}=${record.idValue}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Internal execution methods ────────────────────

  private async executeSafeTool(chainTool: ChainTool): Promise<ToolCallResult | null> {
    const toolDef = this.tools.find((t) => t.name === chainTool.name);
    if (!toolDef) {
      this.kb.addSkippedTool(chainTool.name, "tool definition not found");
      return null;
    }

    // Check if all dependencies are satisfied
    for (const dep of chainTool.dependencies) {
      if (!this.kb.hasSeedValue(dep.sourceFieldHint)) {
        this.kb.addSkippedTool(chainTool.name, `missing dependency: ${dep.sourceFieldHint} (from ${dep.sourceToolName})`);
        return null;
      }
    }

    const args = this.buildArgsFromKnowledgeBase(chainTool);
    logger.debug(`Generator: calling ${chainTool.name} with ${JSON.stringify(args).substring(0, 200)}`);

    try {
      const result = await this.connector.callTool(chainTool.name, args);

      if (result.isError) {
        this.kb.addError(chainTool.name, "tool_error", this.getResultText(result));
        return result;
      }

      // Extract produced values into knowledge base
      for (const fieldHint of chainTool.produces) {
        const extracted = extractFromResponse(result, fieldHint);
        if (extracted) {
          this.kb.setSeedValue(fieldHint, extracted.value);
          this.kb.setExtractionPattern(chainTool.name, extracted.path, extracted.tier);
        }
      }

      return result;
    } catch (err) {
      this.kb.addError(chainTool.name, "invocation_failed", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  private async executeCreateTool(chainTool: ChainTool, chain: DependencyChain): Promise<void> {
    const toolDef = this.tools.find((t) => t.name === chainTool.name);
    if (!toolDef) return;

    const args = this.buildArgsFromKnowledgeBase(chainTool);
    this.injectTestData(args, toolDef);

    logger.debug(`Generator: CREATE ${chainTool.name} with test data`);

    try {
      const result = await this.connector.callTool(chainTool.name, args);

      if (result.isError) {
        this.kb.addError(chainTool.name, "create_failed", this.getResultText(result));
        return;
      }

      // Extract the created ID and track it for cleanup
      for (const fieldHint of chainTool.produces) {
        const extracted = extractFromResponse(result, fieldHint);
        if (extracted && extracted.value) {
          this.kb.setSeedValue(`test_${fieldHint}`, extracted.value);
          this.kb.trackCreatedId(chainTool.name, fieldHint, String(extracted.value));
        }
      }
    } catch (err) {
      this.kb.addError(chainTool.name, "create_failed", err instanceof Error ? err.message : String(err));
    }
  }

  private async executeWriteTool(chainTool: ChainTool, phase: string): Promise<void> {
    const args = this.buildArgsFromKnowledgeBase(chainTool);
    logger.debug(`Generator: ${phase} ${chainTool.name}`);

    try {
      const result = await this.connector.callTool(chainTool.name, args);
      if (result.isError) {
        this.kb.addError(chainTool.name, `${phase}_failed`, this.getResultText(result));
      }
    } catch (err) {
      this.kb.addError(chainTool.name, `${phase}_failed`, err instanceof Error ? err.message : String(err));
    }
  }

  // ── Argument building ─────────────────────────────

  private buildArgsFromKnowledgeBase(chainTool: ChainTool): Record<string, unknown> {
    const toolDef = this.tools.find((t) => t.name === chainTool.name);
    if (!toolDef) return {};

    const args: Record<string, unknown> = {};
    const schema = toolDef.inputSchema;
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return args;

    const seedData = this.kb.getAllSeedData();

    for (const [paramName, paramSchema] of Object.entries(properties)) {
      // Handle nested object params (like Zoho's path_variables, query_params, body)
      // Look inside the nested schema and fill each sub-property from seed data
      if (paramSchema.type === "object" && paramSchema.properties) {
        const nestedProps = paramSchema.properties as Record<string, Record<string, unknown>>;
        const nested: Record<string, unknown> = {};
        let foundAny = false;

        for (const [nestedKey, nestedSchema] of Object.entries(nestedProps)) {
          // Check dependency mapping first
          const dep = chainTool.dependencies.find(
            (d) => d.paramPath === `${paramName}.${nestedKey}` || d.sourceFieldHint === nestedKey
          );
          if (dep) {
            const value = this.kb.getSeedValue(dep.sourceFieldHint) ?? this.kb.getSeedValue(`test_${dep.sourceFieldHint}`);
            if (value != null) { nested[nestedKey] = value; foundAny = true; continue; }
          }

          // Fuzzy search seed data for matching key
          for (const [seedKey, seedValue] of Object.entries(seedData)) {
            const normalizedSeed = seedKey.toLowerCase().replace(/_/g, "");
            const normalizedNested = nestedKey.toLowerCase().replace(/_/g, "");
            if (normalizedSeed === normalizedNested ||
                normalizedSeed.includes(normalizedNested) ||
                (normalizedNested.includes(normalizedSeed) && normalizedSeed.length > 2)) {
              nested[nestedKey] = seedValue; foundAny = true; break;
            }
          }

          // Fall back to sample value for required nested params
          if (!(nestedKey in nested)) {
            nested[nestedKey] = this.generateSampleValue(nestedSchema);
          }
        }

        if (foundAny || (schema.required as string[])?.includes(paramName)) {
          args[paramName] = nested;
        }
        continue;
      }

      // Check if this param has a dependency mapping (flat params)
      const dep = chainTool.dependencies.find((d) => d.paramPath === paramName || d.paramPath.endsWith(`.${paramName}`));

      if (dep) {
        const value = this.kb.getSeedValue(dep.sourceFieldHint) ?? this.kb.getSeedValue(`test_${dep.sourceFieldHint}`);
        if (value != null) { args[paramName] = value; continue; }
      }

      // Fuzzy search seed data
      for (const [seedKey, seedValue] of Object.entries(seedData)) {
        const normalizedSeed = seedKey.toLowerCase().replace(/_/g, "");
        const normalizedParam = paramName.toLowerCase().replace(/_/g, "");
        if (normalizedSeed === normalizedParam) {
          args[paramName] = seedValue; break;
        }
      }

      // Fall back: generate sample value from schema
      if (!(paramName in args) && (schema.required as string[])?.includes(paramName)) {
        args[paramName] = this.generateSampleValue(paramSchema);
      }
    }

    return args;
  }

  private buildNestedValue(
    paramName: string,
    paramPath: string,
    value: unknown,
    paramSchema: Record<string, unknown>
  ): unknown {
    // If paramPath is "path_variables.portal_id" and paramName is "path_variables"
    // we need to build { portal_id: value }
    const parts = paramPath.split(".");
    if (parts.length > 1 && parts[0] === paramName) {
      const nested: Record<string, unknown> = {};
      nested[parts.slice(1).join(".")] = value;
      return nested;
    }
    return value;
  }

  private injectTestData(args: Record<string, unknown>, toolDef: ToolDefinition): void {
    // Add MCPQA_TEST_ prefix to name-like string fields.
    // Detection is schema-driven: check BOTH the key name AND the description.
    const properties = toolDef.inputSchema?.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return;

    for (const [key, schema] of Object.entries(properties)) {
      if (schema.type === "string" && this.isNameLikeField(key, schema)) {
        if (typeof args[key] === "string") {
          args[key] = `${TEST_PREFIX}${args[key]}`;
        } else {
          args[key] = `${TEST_PREFIX}${Date.now()}`;
        }
      }
    }

    // Apply to nested objects too (e.g., "data" or "body" wrappers)
    for (const [key, value] of Object.entries(args)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        const nestedSchema = properties[key];
        const nestedProps = (nestedSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "string" && this.isNameLikeField(k, nestedProps[k] ?? {})) {
            obj[k] = `${TEST_PREFIX}${v}`;
          }
        }
      }
    }
  }

  /**
   * Detect if a field is "name-like" using BOTH key name AND schema description.
   * No hardcoded list of field names — reads what the schema tells us.
   */
  private isNameLikeField(key: string, schema: Record<string, unknown>): boolean {
    const desc = ((schema.description as string) ?? "").toLowerCase();
    const keyLower = key.toLowerCase();

    // Check if the schema description indicates this is a name/label/title field
    const descIndicatesName = /\b(name|title|label|subject|heading|display.?name|human.?readable)\b/.test(desc);

    // Check if the key itself suggests it's a name field
    const keyIndicatesName = /\b(name|title|subject|label|heading)\b/.test(keyLower);

    return descIndicatesName || keyIndicatesName;
  }

  private generateSampleValue(schema: Record<string, unknown>): unknown {
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
    switch (schema.type) {
      case "string": return "test";
      case "number":
      case "integer": return 1;
      case "boolean": return true;
      case "array": return [];
      case "object": return {};
      default: return "test";
    }
  }

  private getResultText(result: ToolCallResult): string {
    return result.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join(" ")
      .substring(0, 500) ?? "no content";
  }
}
