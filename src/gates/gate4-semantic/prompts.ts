/**
 * Prompt templates for Gate 4 LLM evaluation.
 *
 * Design principles from Anthropic's harness design article:
 * 1. Skeptical evaluator — pushes against self-rationalization
 * 2. Actionable fixes — every issue includes specific developer guidance
 * 3. Evidence-based — compares claimed vs actual behavior using Gate 3 data
 * 4. Cross-gate awareness — references findings from Gates 1-3
 */

const RESPONSE_FORMAT = `
Respond in EXACTLY this format:
SCORE: <number 1-5>
REASONING: <one paragraph — be specific about what's wrong, not what's right>
FIXES: <bullet list of specific changes the developer should make — skip if score is 5>
VERDICT: <pass if score >= 3, warn if score == 2, fail if score <= 1>`;

export function descriptionAccuracyPrompt(
  toolName: string,
  description: string,
  inputSchema: string,
  actualResult: string,
  gate1Findings?: string
): string {
  const crossGateContext = gate1Findings
    ? `\nGATE 1 FINDINGS (schema validation already flagged these issues):\n${gate1Findings}\n`
    : "";

  return `You are comparing what an MCP tool CLAIMS to do (its description) against what it ACTUALLY does (invocation result).

TOOL NAME: ${toolName}
DECLARED DESCRIPTION: ${description}
DECLARED INPUT SCHEMA: ${inputSchema}
ACTUAL INVOCATION RESULT: ${actualResult}
${crossGateContext}
Your job: find every discrepancy between the description and the actual behavior.

Scoring:
1 = Description is actively misleading — a developer would build the wrong integration
2 = Major omissions — key behavior or return format not mentioned
3 = Mostly accurate but missing important details (edge cases, error conditions, return format)
4 = Minor gaps only — a developer could integrate correctly with minor guesswork
5 = Perfect match — description is a faithful, complete representation of behavior

BE SKEPTICAL: If the description says "returns X" but the actual result shows Y, that's a discrepancy even if Y is reasonable. The description is a contract.
${RESPONSE_FORMAT}`;
}

export function paramDocClarityPrompt(
  toolName: string,
  description: string,
  inputSchema: string
): string {
  return `You are evaluating whether a developer could call this MCP tool correctly on the FIRST attempt, using ONLY the parameter documentation.

TOOL NAME: ${toolName}
TOOL DESCRIPTION: ${description}
INPUT SCHEMA: ${inputSchema}

For EACH parameter, check:
- Does it have a description? (missing = automatic deduction)
- Is the type clear? (ambiguous types like "string" for complex objects = deduction)
- Are constraints documented? (min/max, patterns, required formats)
- Are edge cases mentioned? (what happens with null, empty string, out-of-range?)
- Would a developer know valid values without trial-and-error?

Scoring:
1 = Unusable — no descriptions, or descriptions that mislead
2 = Guesswork required — types exist but semantics unclear
3 = Adequate — a competent developer could figure it out with some assumptions
4 = Good — clear descriptions, types, and most constraints documented
5 = Excellent — every parameter fully documented with examples and edge cases

BE STRICT: A parameter with type "string" and no description is NOT adequate. A parameter named "data" with description "The data" is NOT helpful.
${RESPONSE_FORMAT}`;
}

export function responseCompletenessPrompt(
  toolName: string,
  description: string,
  actualResult: string
): string {
  return `You are checking whether an MCP tool's response delivers everything its description promises.

TOOL NAME: ${toolName}
DESCRIPTION PROMISES: ${description}
ACTUAL RESPONSE: ${actualResult}

Check:
- Does the response contain every data field the description mentions?
- Is the response format usable? (structured JSON vs raw dump)
- Are there fields in the response that aren't documented?
- Would a consumer need to parse, transform, or guess at the data format?
- Does the response include enough context to be useful standalone?

Scoring:
1 = Empty or useless response
2 = Missing major promised data — description is a broken contract
3 = Most data present, but format or structure requires guesswork
4 = All promised data present with clear structure
5 = Comprehensive — all data plus helpful metadata (pagination, timestamps, etc.)

BE SPECIFIC: If the description says "returns user profile with name, email, and role" but the response only has name and email, that's a 3, not a 4.
${RESPONSE_FORMAT}`;
}

export function integrationReadinessPrompt(
  toolName: string,
  description: string,
  inputSchema: string,
  outputSample: string
): string {
  return `You are a developer seeing this MCP tool for the first time. You have NO access to source code. Can you write working integration code using ONLY this metadata?

TOOL NAME: ${toolName}
DESCRIPTION: ${description}
INPUT SCHEMA: ${inputSchema}
SAMPLE OUTPUT: ${outputSample}

Evaluate:
- Can you construct valid input without guessing?
- Can you parse the output reliably?
- Are error conditions documented?
- Do you know the tool's side effects?
- Would you trust this tool in a production pipeline?

Scoring:
1 = Would not attempt integration — too much unknown
2 = Would require extensive trial-and-error or reading source code
3 = Could integrate with reasonable assumptions, but would add defensive code
4 = Straightforward integration — clear contract, predictable behavior
5 = Production-ready DX — could write reliable integration code in minutes

THINK LIKE A DEVELOPER WHO HAS NEVER SEEN THIS TOOL BEFORE.
${RESPONSE_FORMAT}`;
}

export function errorMessageQualityPrompt(
  toolName: string,
  errorResponses: string,
  boundaryTestDetails?: string
): string {
  const boundaryContext = boundaryTestDetails
    ? `\nBOUNDARY TESTS RUN (what invalid inputs were sent):\n${boundaryTestDetails}\n`
    : "";

  return `You are evaluating how this MCP tool handles bad input. Good error messages help developers debug; bad ones waste hours.

TOOL NAME: ${toolName}
ERROR RESPONSES COLLECTED: ${errorResponses}
${boundaryContext}
For each error response, check:
- Does it identify WHICH parameter was wrong?
- Does it explain WHY the input was rejected?
- Does it suggest HOW to fix it?
- Does it use isError=true correctly?
- Is the error distinguishable from a success response?

Scoring:
1 = No error handling — tool accepts bad input silently or crashes
2 = Generic errors — "error occurred" with no actionable detail
3 = Identifies the problem but not the fix
4 = Clear problem identification with hints toward the fix
5 = Excellent — specific parameter, clear constraint violation, suggested correction

CRITICAL: If the tool returns isError=false for invalid inputs (accepts them silently), that's a 1. Silent failures are the worst kind of error handling.
${RESPONSE_FORMAT}`;
}

export function toolChainDiscoveryPrompt(
  tools: Array<{ name: string; description: string }>,
  gate1Summary?: string,
  gate2Summary?: string
): string {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const crossGate = [gate1Summary, gate2Summary].filter(Boolean).join("\n");
  const crossGateSection = crossGate
    ? `\nCROSS-GATE CONTEXT (issues already found by other validators):\n${crossGate}\n`
    : "";

  return `You are analyzing an MCP server's complete tool ecosystem. This is a holistic review — not individual tools, but how they work TOGETHER.

AVAILABLE TOOLS (${tools.length} total):
${toolList}
${crossGateSection}
Analyze:
1. TOOL CHAINS: Which tools form logical sequences? (create → read → update → delete)
2. GAPS: What operations are obviously missing? (e.g., can create but not delete)
3. NAMING: Are names consistent? (getUser vs fetch_account vs RetrieveContact = bad)
4. OVERLAPS: Are any tools redundant?
5. DISCOVERABILITY: Would a developer know which tools to call and in what order?

Scoring:
1 = Incoherent collection — no logical grouping, major CRUD gaps
2 = Partial coverage — some workflows possible but critical operations missing
3 = Adequate — main workflows covered, minor gaps in edge cases
4 = Good ecosystem — clear tool families, consistent naming, complete workflows
5 = Excellent — comprehensive coverage, intuitive naming, well-documented relationships
${RESPONSE_FORMAT}`;
}

/**
 * Holistic summary prompt — runs ONCE at the end of Gate 4 to produce
 * an actionable improvement plan that cross-references ALL gates.
 * This is the "sprint contract" from Anthropic's harness pattern.
 */
export function holisticSummaryPrompt(
  serverName: string,
  toolCount: number,
  gate1Summary: string,
  gate2Summary: string,
  gate3Summary: string,
  gate4Scores: Array<{ validator: string; avgScore: number; failCount: number }>,
  allFixes: Array<{ tool: string; fixes: string[] }>
): string {
  const scoreTable = gate4Scores
    .map((s) => `- ${s.validator}: ${s.avgScore.toFixed(1)}/5 (${s.failCount} fails)`)
    .join("\n");

  const fixList = allFixes
    .filter((f) => f.fixes.length > 0)
    .slice(0, 20) // Cap to avoid token overflow
    .map((f) => `${f.tool}:\n${f.fixes.map((fix) => `  - ${fix}`).join("\n")}`)
    .join("\n");

  return `You are writing the FINAL QA REPORT for an MCP server. This is the document the developer will use to improve their server. Make it specific, prioritized, and actionable.

SERVER: ${serverName} (${toolCount} tools)

GATE 1 (Schema) FINDINGS:
${gate1Summary}

GATE 2 (Security) FINDINGS:
${gate2Summary}

GATE 3 (Functional) FINDINGS:
${gate3Summary}

GATE 4 (Semantic) SCORES:
${scoreTable}

SPECIFIC FIXES IDENTIFIED:
${fixList || "None identified"}

Write a prioritized improvement plan:

1. CRITICAL (must fix before publishing): Issues that would cause integration failures or security problems
2. HIGH (should fix): Issues that degrade developer experience or tool reliability
3. MEDIUM (recommended): Quality improvements that would differentiate this server
4. LOW (nice to have): Polish items

For each item, specify:
- The exact tool name
- What's wrong
- The specific change to make
- Why it matters for end users

Respond in EXACTLY this format:
SCORE: <overall quality score 1-5>
REASONING: <one paragraph summary of the server's readiness>
FIXES:
CRITICAL:
- [tool_name] specific fix description
HIGH:
- [tool_name] specific fix description
MEDIUM:
- [tool_name] specific fix description
VERDICT: <pass if score >= 3, warn if score == 2, fail if score <= 1>`;
}
