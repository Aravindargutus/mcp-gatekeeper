import type { ToolDefinition } from "../core/types.js";
import { LLMJudge, type LLMJudgeConfig } from "../gates/gate4-semantic/llm-judge.js";
import { KnowledgeBase, type DependencyChain, type ChainTool, type ToolClassification } from "./knowledge-base.js";
import { logger } from "../utils/logger.js";

const PLANNER_PROMPT = `You are analyzing MCP tool schemas to build a dependency graph.

TOOLS:
{TOOL_SCHEMAS}

Analyze ALL tools and respond in this EXACT JSON format (no markdown, no explanation — ONLY the JSON):

{
  "chains": [
    {
      "chainId": "service-name",
      "serviceName": "Human readable service name",
      "tools": [
        {
          "name": "exact_tool_name",
          "classification": "safe|create|update|delete|restore|destructive",
          "layer": 0,
          "dependencies": [
            {
              "paramPath": "path_variables.portal_id",
              "sourceToolName": "get_organization",
              "sourceFieldHint": "portal_id"
            }
          ],
          "produces": ["portal_id", "org_name"],
          "sideEffects": false
        }
      ],
      "rootTools": ["tool_names_with_no_dependencies"],
      "lifecycleOrder": ["get_org", "get_projects", "create_project", "update_project", "delete_project"]
    }
  ]
}

RULES:
- classification: "safe" = read-only (get/list/search/fetch), "create" = creates data, "update" = modifies data, "delete" = removes/trashes data, "restore" = recovers deleted data, "destructive" = bulk/permanent delete (mass_delete, purge)
- layer: 0 = no dependencies (can call immediately), 1 = depends on layer 0, 2 = depends on layer 1, etc.
- dependencies: look at inputSchema params — if a tool needs "portal_id", find which OTHER tool produces it
- produces: what ID fields would be in this tool's response (infer from the tool's purpose)
- sideEffects: true for create/update/delete/restore, false for read-only
- Group tools into chains by SERVICE (tools that share the same domain/IDs)
- Every tool must appear in exactly one chain
- Tools with no dependencies AND no relationship to others = put in a "standalone" chain`;

/**
 * Planner — LLM-based dependency chain discovery.
 *
 * Makes ONE LLM call to analyze ALL tool schemas and returns
 * the complete dependency graph. Result is cached in KnowledgeBase
 * and reused until tool schemas change.
 */
export async function discoverChains(
  tools: ToolDefinition[],
  llmConfig?: Partial<LLMJudgeConfig>
): Promise<DependencyChain[]> {
  logger.info(`Planner: analyzing ${tools.length} tool schemas...`);

  // Build compact schema representation for the prompt
  const toolSchemas = tools.map((t) => ({
    name: t.name,
    description: (t.description ?? "").substring(0, 200),
    inputSchema: t.inputSchema,
  }));

  const prompt = PLANNER_PROMPT.replace(
    "{TOOL_SCHEMAS}",
    JSON.stringify(toolSchemas, null, 2)
  );

  const judge = new LLMJudge({ ...llmConfig, maxTokens: 4096, temperature: 0 });

  // Use evaluate() but we parse the raw JSON response, not the SCORE/VERDICT format
  const response = await judge.evaluate(prompt);
  const rawText = response.raw ?? response.reasoning;

  // Extract JSON from the response (LLM might wrap it in markdown)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error("Planner: LLM did not return valid JSON");
    logger.debug(`Planner raw response: ${rawText.substring(0, 500)}`);
    return buildFallbackChains(tools);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const chains = parsed.chains as DependencyChain[];

    if (!Array.isArray(chains) || chains.length === 0) {
      logger.warn("Planner: LLM returned empty chains, using fallback");
      return buildFallbackChains(tools);
    }

    logger.info(`Planner: discovered ${chains.length} chain(s) covering ${chains.reduce((s, c) => s + c.tools.length, 0)} tools`);
    return chains;
  } catch (err) {
    logger.error(`Planner: failed to parse LLM response: ${err instanceof Error ? err.message : String(err)}`);
    return buildFallbackChains(tools);
  }
}

/**
 * Fallback chain builder — used when LLM fails.
 * Classifies tools by name heuristics and puts them all in one chain.
 */
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
    serviceName: "All Tools (fallback — LLM discovery failed)",
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
