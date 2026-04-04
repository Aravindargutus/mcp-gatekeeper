/**
 * Prompt templates for Gate 4 LLM evaluation.
 * Each template takes tool data and returns a structured prompt
 * that asks the LLM to score 1-5 with reasoning and verdict.
 */

export function descriptionAccuracyPrompt(toolName: string, description: string, inputSchema: string, actualResult: string): string {
  return `You are evaluating whether an MCP tool's description accurately reflects its actual behavior.

TOOL NAME: ${toolName}
TOOL DESCRIPTION: ${description}
INPUT SCHEMA: ${inputSchema}
ACTUAL INVOCATION RESULT: ${actualResult}

Rate how accurately the description matches the actual behavior on a scale of 1-5:
1 = Completely misleading — description says one thing, tool does another
2 = Mostly inaccurate — major aspects of behavior not mentioned
3 = Partially accurate — captures the gist but misses key details
4 = Mostly accurate — minor gaps only
5 = Perfectly accurate — description is a faithful representation

Respond in EXACTLY this format:
SCORE: <number 1-5>
REASONING: <one paragraph explaining your rating>
VERDICT: <pass if score >= 3, warn if score == 2, fail if score <= 1>`;
}

export function paramDocClarityPrompt(toolName: string, description: string, inputSchema: string): string {
  return `You are evaluating the clarity of an MCP tool's parameter documentation. Could a developer use this tool correctly based solely on the parameter descriptions?

TOOL NAME: ${toolName}
TOOL DESCRIPTION: ${description}
INPUT SCHEMA (with parameter descriptions): ${inputSchema}

Rate parameter documentation clarity on a scale of 1-5:
1 = No parameter descriptions at all, or completely unhelpful
2 = Descriptions exist but are vague or misleading
3 = Descriptions are adequate but missing edge cases or constraints
4 = Clear descriptions with types and most constraints documented
5 = Excellent — every parameter has clear description, type, constraints, and examples

Respond in EXACTLY this format:
SCORE: <number 1-5>
REASONING: <one paragraph>
VERDICT: <pass if score >= 3, warn if score == 2, fail if score <= 1>`;
}

export function responseCompletenessPrompt(toolName: string, description: string, actualResult: string): string {
  return `You are evaluating whether an MCP tool's response contains all the data that its description promises.

TOOL NAME: ${toolName}
TOOL DESCRIPTION: ${description}
ACTUAL RESPONSE: ${actualResult}

Rate response completeness on a scale of 1-5:
1 = Response is empty or contains no useful data
2 = Response has some data but is missing major promised fields
3 = Response has most expected data with minor gaps
4 = Response contains all expected data with good structure
5 = Comprehensive response with all promised data and helpful formatting

Respond in EXACTLY this format:
SCORE: <number 1-5>
REASONING: <one paragraph>
VERDICT: <pass if score >= 3, warn if score == 2, fail if score <= 1>`;
}

export function integrationReadinessPrompt(toolName: string, description: string, inputSchema: string, outputSample: string): string {
  return `You are evaluating whether a developer could successfully integrate this MCP tool based ONLY on its metadata (no access to source code).

TOOL NAME: ${toolName}
DESCRIPTION: ${description}
INPUT SCHEMA: ${inputSchema}
SAMPLE OUTPUT: ${outputSample}

Rate integration readiness on a scale of 1-5:
1 = Impossible to integrate — critical information missing
2 = Very difficult — would require trial-and-error or source code access
3 = Feasible with some guesswork — most info present but some gaps
4 = Straightforward — clear inputs, outputs, and behavior
5 = Excellent developer experience — everything needed for integration is documented

Respond in EXACTLY this format:
SCORE: <number 1-5>
REASONING: <one paragraph>
VERDICT: <pass if score >= 3, warn if score == 2, fail if score <= 1>`;
}

export function errorMessageQualityPrompt(toolName: string, errorResponses: string): string {
  return `You are evaluating the quality of error messages returned by an MCP tool when given invalid inputs.

TOOL NAME: ${toolName}
ERROR RESPONSES: ${errorResponses}

Rate error message quality on a scale of 1-5:
1 = No error message at all, or generic "error occurred"
2 = Error message exists but doesn't explain what went wrong
3 = Error message identifies the problem but not how to fix it
4 = Error message identifies the problem and hints at the fix
5 = Excellent — specific error, clear cause, and actionable fix suggestion

If no error responses are available, score based on whether the tool should have returned errors.

Respond in EXACTLY this format:
SCORE: <number 1-5>
REASONING: <one paragraph>
VERDICT: <pass if score >= 3, warn if score == 2, fail if score <= 1>`;
}

export function toolChainDiscoveryPrompt(tools: Array<{ name: string; description: string }>): string {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return `You are analyzing a set of MCP tools to identify logical tool chains and missing tools.

AVAILABLE TOOLS:
${toolList}

Analyze and report:
1. Which tools logically work together in sequence? (e.g., create → get → update → delete)
2. Are there gaps — operations that logically should exist but are missing?
3. Are there tools that seem redundant or overlapping?
4. Would a developer know the correct order to call these tools?

Respond in EXACTLY this format:
SCORE: <number 1-5 rating the completeness of the tool ecosystem>
REASONING: <one paragraph identifying chains, gaps, and redundancies>
VERDICT: <pass if score >= 3, warn if score == 2, fail if score <= 1>`;
}
