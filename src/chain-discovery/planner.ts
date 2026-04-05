import type { ToolDefinition } from "../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../gates/gate4-semantic/llm-judge.js";
import type { DependencyChain, ChainTool, ToolClassification } from "./knowledge-base.js";
import { logger } from "../utils/logger.js";

/**
 * Phase 1 prompt: Classify tools and group into service chains.
 * Output is intentionally SMALL — just tool names and groups.
 */
const CLASSIFY_PROMPT = `Analyze these MCP tool names and descriptions. Group them by service/domain and classify each.

TOOLS:
{TOOL_LIST}

Respond in EXACTLY this JSON format (no markdown, no explanation):
{
  "chains": [
    {
      "chainId": "short-id",
      "serviceName": "Human Name",
      "tools": ["tool_name_1", "tool_name_2"]
    }
  ],
  "classifications": {
    "tool_name": "safe|create|update|delete|restore|destructive"
  }
}

Classifications: safe=read-only, create=makes data, update=modifies, delete=removes, restore=recovers, destructive=bulk/permanent`;

/**
 * Phase 3 prompt: Infer valid parameter values for params without enums.
 * This is why tools work in Cursor but fail in our tests — Cursor users
 * provide domain knowledge ("Leads"), but our framework sends "test".
 */
const INFER_VALUES_PROMPT = `These MCP tools have parameters WITHOUT enum values or examples. Based on the tool names, descriptions, and the service domain, infer the most likely VALID values.

TOOLS AND THEIR UNDOCUMENTED PARAMS:
{PARAMS_NEEDING_VALUES}

For each parameter, provide 1-3 realistic values that would make the tool work.

Respond in EXACTLY this JSON format (no markdown):
{
  "inferredValues": {
    "param_name": ["value1", "value2"]
  }
}

Examples of good inferences:
- A "module" param on a CRM tool → ["Leads", "Contacts", "Deals"]
- A "status" param on a project tool → ["active", "completed", "on_hold"]
- A "format" param on an export tool → ["json", "csv", "xml"]
- A "portal_id" with no enum → use a realistic placeholder like "default"

Only infer values you are confident about based on the service domain. Skip params you can't reasonably guess.`;

/**
 * Phase 2 prompt: For ONE chain, discover dependencies between its tools.
 * Much smaller scope = reliable JSON output.
 */
const DEPENDENCY_PROMPT = `Analyze the dependencies between these related MCP tools.

SERVICE: {SERVICE_NAME}
TOOLS:
{TOOL_SCHEMAS}

For each tool, identify:
1. What parameters it needs from OTHER tools' responses
2. What IDs/values it produces in its response
3. What layer it's in (0=no deps, 1=needs layer 0, 2=needs layer 1)

Respond in EXACTLY this JSON format (no markdown):
{
  "tools": [
    {
      "name": "tool_name",
      "layer": 0,
      "dependencies": [
        {"paramPath": "path_variables.portal_id", "sourceToolName": "get_portal", "sourceFieldHint": "portal_id"}
      ],
      "produces": ["portal_id", "org_name"]
    }
  ],
  "lifecycleOrder": ["get_portal", "get_projects", "create_task", "delete_task"]
}`;

/**
 * Planner — Two-phase LLM-based chain discovery.
 *
 * Phase 1 (1 LLM call): Classify + group ALL tools (small output)
 * Phase 2 (1 LLM call per chain): Discover dependencies within each chain
 *
 * For 65 tools in 4 chains: 1 + 4 = 5 LLM calls total.
 * Much more reliable than trying to produce 400+ lines of JSON in one shot.
 */
export async function discoverChains(
  tools: ToolDefinition[],
  llmConfig?: Partial<LLMJudgeConfig>
): Promise<DependencyChain[]> {
  logger.info(`Planner: analyzing ${tools.length} tool schemas...`);

  const judge = new LLMJudge({ ...llmConfig, maxTokens: 4096, temperature: 0 });

  // ── Phase 1: Classify and group ──────────────────
  const toolList = tools.map((t) =>
    `- ${t.name}: ${(t.description ?? "").substring(0, 100)}`
  ).join("\n");

  const classifyPrompt = CLASSIFY_PROMPT.replace("{TOOL_LIST}", toolList);
  const classifyResponse = await judge.evaluate(classifyPrompt);
  const classifyRaw = classifyResponse.raw ?? classifyResponse.reasoning;

  let chainGroups: Array<{ chainId: string; serviceName: string; tools: string[] }>;
  let classifications: Record<string, ToolClassification>;

  const classifyJson = classifyRaw.match(/\{[\s\S]*\}/);
  if (classifyJson) {
    try {
      const parsed = JSON.parse(classifyJson[0]);
      chainGroups = parsed.chains ?? [];
      classifications = parsed.classifications ?? {};
      logger.info(`Planner Phase 1: ${chainGroups.length} chain(s), ${Object.keys(classifications).length} classified`);
    } catch (err) {
      logger.warn(`Planner Phase 1 parse failed: ${err instanceof Error ? err.message : String(err)}`);
      return buildFallbackChains(tools);
    }
  } else {
    logger.warn("Planner Phase 1: no JSON in response");
    return buildFallbackChains(tools);
  }

  // ── Phase 2: Discover dependencies per chain ─────
  // Sub-chunk large chains to keep LLM output reliable
  const MAX_TOOLS_PER_PHASE2 = 20;
  const chains: DependencyChain[] = [];

  for (const group of chainGroups) {
    const chainTools = tools.filter((t) => group.tools.includes(t.name));
    if (chainTools.length === 0) continue;

    // Split large chains into sub-groups
    if (chainTools.length > MAX_TOOLS_PER_PHASE2) {
      logger.info(`Planner: splitting "${group.chainId}" (${chainTools.length} tools) into chunks of ${MAX_TOOLS_PER_PHASE2}`);
      const subChains = await discoverLargeChain(group, chainTools, classifications, judge);
      chains.push(...subChains);
      continue;
    }

    // Build compact schemas for just this chain's tools
    const chainSchemas = chainTools.map((t) => ({
      name: t.name,
      description: (t.description ?? "").substring(0, 150),
      params: Object.keys((t.inputSchema?.properties ?? {}) as Record<string, unknown>),
      inputSchema: t.inputSchema,
    }));

    const depPrompt = DEPENDENCY_PROMPT
      .replace("{SERVICE_NAME}", group.serviceName)
      .replace("{TOOL_SCHEMAS}", JSON.stringify(chainSchemas, null, 2));

    try {
      const depResponse = await judge.evaluate(depPrompt);
      const depRaw = depResponse.raw ?? depResponse.reasoning;
      const depJson = depRaw.match(/\{[\s\S]*\}/);

      if (depJson) {
        const parsed = JSON.parse(depJson[0]);
        const depTools: ChainTool[] = (parsed.tools ?? []).map((t: Record<string, unknown>) => ({
          name: t.name as string,
          classification: classifications[t.name as string] ?? classifyByName(t.name as string),
          layer: (t.layer as number) ?? 0,
          dependencies: (t.dependencies ?? []) as ChainTool["dependencies"],
          produces: (t.produces ?? []) as string[],
          sideEffects: ["create", "update", "delete", "restore", "destructive"].includes(
            classifications[t.name as string] ?? ""
          ),
        }));

        chains.push({
          chainId: group.chainId,
          serviceName: group.serviceName,
          tools: depTools,
          rootTools: depTools.filter((t) => t.layer === 0).map((t) => t.name),
          lifecycleOrder: (parsed.lifecycleOrder ?? depTools.map((t: ChainTool) => t.name)) as string[],
        });

        logger.info(`Planner Phase 2: chain "${group.chainId}" — ${depTools.length} tools, ${depTools.filter((t) => t.layer === 0).length} root(s)`);
      }
    } catch (err) {
      logger.warn(`Planner Phase 2 failed for "${group.chainId}": ${err instanceof Error ? err.message : String(err)}`);
      // Add chain with fallback classification
      const fallbackTools: ChainTool[] = chainTools.map((t) => ({
        name: t.name,
        classification: classifications[t.name] ?? classifyByName(t.name, t.description),
        layer: (classifications[t.name] ?? classifyByName(t.name, t.description)) === "safe" ? 0 : 1,
        dependencies: [],
        produces: [],
        sideEffects: (classifications[t.name] ?? classifyByName(t.name, t.description)) !== "safe",
      }));
      chains.push({
        chainId: group.chainId,
        serviceName: group.serviceName,
        tools: fallbackTools,
        rootTools: fallbackTools.filter((t) => t.layer === 0).map((t) => t.name),
        lifecycleOrder: fallbackTools.map((t) => t.name),
      });
    }
  }

  // Catch tools not in any chain
  const coveredTools = new Set(chains.flatMap((c) => c.tools.map((t) => t.name)));
  const uncovered = tools.filter((t) => !coveredTools.has(t.name));
  if (uncovered.length > 0) {
    logger.info(`Planner: ${uncovered.length} tool(s) not in any chain — adding as standalone`);
    chains.push({
      chainId: "standalone",
      serviceName: "Standalone Tools",
      tools: uncovered.map((t) => ({
        name: t.name,
        classification: classifications[t.name] ?? classifyByName(t.name, t.description),
        layer: 0,
        dependencies: [],
        produces: [],
        sideEffects: (classifications[t.name] ?? classifyByName(t.name, t.description)) !== "safe",
      })),
      rootTools: uncovered.map((t) => t.name),
      lifecycleOrder: uncovered.map((t) => t.name),
    });
  }

  // ── Phase 3: Infer valid values for params without enums ──
  const paramsNeedingValues = findParamsWithoutEnums(tools);
  if (paramsNeedingValues.length > 0) {
    logger.info(`Planner Phase 3: inferring values for ${paramsNeedingValues.length} undocumented params...`);
    const inferPrompt = INFER_VALUES_PROMPT.replace(
      "{PARAMS_NEEDING_VALUES}",
      paramsNeedingValues.map((p) => `- Tool "${p.tool}", param "${p.param}": type=${p.type}, context="${p.context}"`).join("\n")
    );

    try {
      const inferResponse = await judge.evaluate(inferPrompt);
      const inferRaw = inferResponse.raw ?? inferResponse.reasoning;
      const inferJson = inferRaw.match(/\{[\s\S]*\}/);
      if (inferJson) {
        const parsed = JSON.parse(inferJson[0]);
        const inferred = parsed.inferredValues ?? {};
        // Store inferred values — the Generator will use these as seed data
        for (const chain of chains) {
          for (const tool of chain.tools) {
            for (const dep of tool.dependencies) {
              if (inferred[dep.sourceFieldHint]) {
                tool.produces = tool.produces ?? [];
                // Tag inferred values with _inferred prefix for clarity
              }
            }
          }
        }
        // Attach inferred values to the result for the Generator to consume
        (chains as any).__inferredValues = inferred;
        logger.info(`Planner Phase 3: inferred values for ${Object.keys(inferred).length} params`);
      }
    } catch (err) {
      logger.warn(`Planner Phase 3 failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`Planner complete: ${chains.length} chain(s), ${chains.reduce((s, c) => s + c.tools.length, 0)} tools`);
  return chains;
}

/** Find parameters that lack enums, examples, or defaults */
function findParamsWithoutEnums(tools: ToolDefinition[]): Array<{ tool: string; param: string; type: string; context: string }> {
  const result: Array<{ tool: string; param: string; type: string; context: string }> = [];

  for (const tool of tools) {
    const properties = tool.inputSchema?.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) continue;

    for (const [paramName, paramSchema] of Object.entries(properties)) {
      // Check nested object properties (like path_variables.module)
      if (paramSchema.type === "object" && paramSchema.properties) {
        const nested = paramSchema.properties as Record<string, Record<string, unknown>>;
        for (const [nestedKey, nestedSchema] of Object.entries(nested)) {
          if (nestedSchema.type === "string" && !nestedSchema.enum && !nestedSchema.default && !nestedSchema.const) {
            result.push({
              tool: tool.name,
              param: `${paramName}.${nestedKey}`,
              type: "string",
              context: `${tool.name}: ${(tool.description ?? "").substring(0, 100)}`,
            });
          }
        }
      }
      // Check flat string params
      else if (paramSchema.type === "string" && !paramSchema.enum && !paramSchema.default && !paramSchema.const) {
        result.push({
          tool: tool.name,
          param: paramName,
          type: "string",
          context: `${tool.name}: ${(tool.description ?? "").substring(0, 100)}`,
        });
      }
    }
  }

  // Deduplicate by param name (same param across tools = same valid values)
  const seen = new Set<string>();
  return result.filter((p) => {
    const key = p.param.split(".").pop()!;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Handle chains with >20 tools by splitting into sub-chunks */
async function discoverLargeChain(
  group: { chainId: string; serviceName: string; tools: string[] },
  chainTools: ToolDefinition[],
  classifications: Record<string, ToolClassification>,
  judge: LLMJudge
): Promise<DependencyChain[]> {
  const MAX = 20;
  const chunks: ToolDefinition[][] = [];
  for (let i = 0; i < chainTools.length; i += MAX) {
    chunks.push(chainTools.slice(i, i + MAX));
  }

  const allChainTools: ChainTool[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkSchemas = chunk.map((t) => ({
      name: t.name,
      description: (t.description ?? "").substring(0, 150),
      params: Object.keys((t.inputSchema?.properties ?? {}) as Record<string, unknown>),
      inputSchema: t.inputSchema,
    }));

    const depPrompt = DEPENDENCY_PROMPT
      .replace("{SERVICE_NAME}", `${group.serviceName} (part ${i + 1}/${chunks.length})`)
      .replace("{TOOL_SCHEMAS}", JSON.stringify(chunkSchemas, null, 2));

    try {
      const depResponse = await judge.evaluate(depPrompt);
      const depRaw = depResponse.raw ?? depResponse.reasoning;
      const depJson = depRaw.match(/\{[\s\S]*\}/);

      if (depJson) {
        const parsed = JSON.parse(depJson[0]);
        for (const t of (parsed.tools ?? [])) {
          allChainTools.push({
            name: t.name as string,
            classification: classifications[t.name as string] ?? classifyByName(t.name as string),
            layer: (t.layer as number) ?? 0,
            dependencies: (t.dependencies ?? []) as ChainTool["dependencies"],
            produces: (t.produces ?? []) as string[],
            sideEffects: ["create", "update", "delete", "restore", "destructive"].includes(
              classifications[t.name as string] ?? ""
            ),
          });
        }
        logger.info(`Planner Phase 2: chunk ${i + 1}/${chunks.length} — ${(parsed.tools ?? []).length} tools resolved`);
      }
    } catch (err) {
      logger.warn(`Planner Phase 2 chunk ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      // Fallback for this chunk
      for (const t of chunk) {
        allChainTools.push({
          name: t.name,
          classification: classifications[t.name] ?? classifyByName(t.name, t.description),
          layer: (classifications[t.name] ?? classifyByName(t.name, t.description)) === "safe" ? 0 : 1,
          dependencies: [],
          produces: [],
          sideEffects: (classifications[t.name] ?? classifyByName(t.name, t.description)) !== "safe",
        });
      }
    }
  }

  return [{
    chainId: group.chainId,
    serviceName: group.serviceName,
    tools: allChainTools,
    rootTools: allChainTools.filter((t) => t.layer === 0).map((t) => t.name),
    lifecycleOrder: allChainTools.map((t) => t.name),
  }];
}

function buildFallbackChains(tools: ToolDefinition[]): DependencyChain[] {
  logger.warn("Planner: using heuristic fallback (no LLM)");
  const chainTools: ChainTool[] = tools.map((t) => ({
    name: t.name,
    classification: classifyByName(t.name, t.description),
    layer: classifyByName(t.name, t.description) === "safe" ? 0 : 1,
    dependencies: [],
    produces: [],
    sideEffects: classifyByName(t.name, t.description) !== "safe",
  }));

  return [{
    chainId: "fallback",
    serviceName: "All Tools (fallback)",
    tools: chainTools,
    rootTools: chainTools.filter((t) => t.layer === 0).map((t) => t.name),
    lifecycleOrder: chainTools.map((t) => t.name),
  }];
}

function classifyByName(name: string, desc?: string): ToolClassification {
  const text = `${name} ${desc ?? ""}`.toLowerCase();
  if (/\b(delete|remove|trash|drop)\b/.test(text)) return "delete";
  if (/\b(restore|recover|undelete|untrash)\b/.test(text)) return "restore";
  if (/\b(mass_delete|purge|destroy|wipe)\b/.test(text)) return "destructive";
  if (/\b(create|add|insert|post|new)\b/.test(text)) return "create";
  if (/\b(update|modify|patch|put|edit)\b/.test(text)) return "update";
  if (/\b(get|list|search|find|fetch|read|retrieve|view|show)\b/.test(text)) return "safe";
  return "unknown";
}
