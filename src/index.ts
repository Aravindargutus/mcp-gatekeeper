// Public API
export { PipelineOrchestrator } from "./core/pipeline.js";
export { ValidationContext } from "./core/context.js";
export { BaseGate } from "./core/gate.js";
export { loadConfig, mergeConfigWithCLI, PipelineConfigSchema } from "./core/config.js";
export type { PipelineConfig, ServerTarget, GateConfig } from "./core/config.js";

// Types
export { Severity, worstSeverity, isBlocking } from "./core/types.js";
export type {
  ValidatorResult,
  GateResult,
  PipelineReport,
  ToolDefinition,
  ToolCallResult,
  MCPInitializeResult,
  ServerCapabilities,
} from "./core/types.js";

// Interfaces
export type { IValidator, IGate, IReporter, IMCPConnector } from "./core/interfaces.js";

// Connectors
export { createConnector } from "./connectors/factory.js";
export { StdioConnector } from "./connectors/stdio.connector.js";
export { SSEConnector } from "./connectors/sse.connector.js";
export { HttpConnector } from "./connectors/http.connector.js";
export { MockConnector } from "./connectors/mock.connector.js";
export { NullConnector } from "./connectors/null.connector.js";

// Gates
export { createGates } from "./gates/gate.factory.js";
export { SchemaGate } from "./gates/gate1-schema/index.js";
export { SecurityGate } from "./gates/gate2-security/index.js";
export { FunctionalGate } from "./gates/gate3-functional/index.js";
export { SemanticGate } from "./gates/gate4-semantic/index.js";
export { ReviewGate } from "./gates/gate5-review/index.js";
export { SkillsGate } from "./gates/gate6-skills/index.js";
export { ExtensionsGate } from "./gates/gate7-extensions/index.js";
export { PackageGate } from "./gates/gate8-package/index.js";
export { ResourcesGate } from "./gates/gate9-resources/index.js";
export { PromptsGate } from "./gates/gate10-prompts/index.js";

// Reporters
export { ConsoleReporter } from "./reporting/console.reporter.js";
export { JsonReporter } from "./reporting/json.reporter.js";
export { HtmlReporter } from "./reporting/html.reporter.js";
export { BufferReporter } from "./reporting/buffer.reporter.js";
export { SarifReporter } from "./reporting/sarif.reporter.js";
export { CheckpointReporter } from "./reporting/checkpoint.reporter.js";

// Utilities
export { parseFrontmatter, countWords } from "./utils/frontmatter.js";
export { diffReports } from "./diff.js";
export { RegressionTracker } from "./regression.js";
export { LLMJudge } from "./gates/gate4-semantic/llm-judge.js";
export type { JudgeVerdict, TrialResult, LLMJudgeConfig } from "./gates/gate4-semantic/llm-judge.js";
export { TranscriptRecorder } from "./gates/gate4-semantic/transcript.js";

// Errors
export {
  MCPQAError,
  GateFailedError,
  MCPConnectionError,
  ConfigError,
  ValidatorError,
} from "./core/errors.js";
