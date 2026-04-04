import { z } from "zod";
import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "./errors.js";

const ValidatorConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
  })
  .passthrough();

const GateConfigSchema = z.object({
  enabled: z.boolean().default(true),
  failOnWarn: z.boolean().default(false),
  validators: z.record(ValidatorConfigSchema).default({}),
});

export const ServerTargetSchema = z.object({
  transport: z.enum(["stdio", "sse", "http", "mock", "null"]).default("stdio"),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  url: z.string().optional(),
  headers: z.record(z.string()).default({}),
  env: z.record(z.string()).default({}),
  connectTimeout: z.number().min(1_000).max(120_000).default(30_000),
  requestTimeout: z.number().min(1_000).max(300_000).default(60_000),
  sessionId: z.string().optional(),
  skillPath: z.string().optional(),
  extensionPath: z.string().optional(),
});

export const PipelineConfigSchema = z.object({
  pipeline: z
    .object({
      mode: z.enum(["strict", "lenient"]).default("strict"),
      enabledGates: z.array(z.number().min(1).max(7)).default([1, 2, 3]),
      timeoutSeconds: z.number().min(10).max(7200).default(1800),
      gateTimeoutSeconds: z.number().min(5).max(3600).default(300),
    })
    .default({}),
  server: ServerTargetSchema.default({}),
  gates: z
    .object({
      1: GateConfigSchema.default({}),
      2: GateConfigSchema.default({}),
      3: GateConfigSchema.default({}),
      4: GateConfigSchema.default({}),
      5: GateConfigSchema.default({}),
      6: GateConfigSchema.default({}),
      7: GateConfigSchema.default({}),
    })
    .default({}),
  reporting: z
    .object({
      formats: z
        .array(z.enum(["json", "html", "console"]))
        .default(["console", "json"]),
      outputDir: z.string().default("./reports"),
    })
    .default({}),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type ServerTarget = z.infer<typeof ServerTargetSchema>;
export type GateConfig = z.infer<typeof GateConfigSchema>;

export function loadConfig(configPath: string): PipelineConfig {
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw);
    return PipelineConfigSchema.parse(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.errors
        .map((e) => `  ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      throw new ConfigError(`Invalid configuration:\n${messages}`);
    }
    throw new ConfigError(
      `Failed to load config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function mergeConfigWithCLI(
  config: PipelineConfig,
  overrides: {
    gates?: number[];
    mode?: "strict" | "lenient";
    serverCmd?: string;
    serverArgs?: string[];
    serverUrl?: string;
    transport?: "stdio" | "sse" | "http" | "mock" | "null";
    headers?: Record<string, string>;
    skillPath?: string;
    extensionPath?: string;
  }
): PipelineConfig {
  const merged = structuredClone(config);

  if (overrides.gates) {
    merged.pipeline.enabledGates = overrides.gates;
  }
  if (overrides.mode) {
    merged.pipeline.mode = overrides.mode;
  }
  if (overrides.serverCmd) {
    merged.server.command = overrides.serverCmd;
    merged.server.transport = "stdio";
  }
  if (overrides.serverArgs) {
    merged.server.args = overrides.serverArgs;
  }
  if (overrides.serverUrl) {
    merged.server.url = overrides.serverUrl;
    if (!overrides.transport) {
      merged.server.transport = "http";
    }
  }
  if (overrides.transport) {
    merged.server.transport = overrides.transport;
  }
  if (overrides.headers) {
    merged.server.headers = overrides.headers;
  }
  if (overrides.skillPath) {
    merged.server.skillPath = overrides.skillPath;
    // Auto-set null transport if only validating skills
    if (!overrides.serverCmd && !overrides.serverUrl) {
      merged.server.transport = "null";
    }
  }
  if (overrides.extensionPath) {
    merged.server.extensionPath = overrides.extensionPath;
    if (!overrides.serverCmd && !overrides.serverUrl) {
      merged.server.transport = "null";
    }
  }

  return merged;
}
