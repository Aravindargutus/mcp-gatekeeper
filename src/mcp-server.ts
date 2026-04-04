#!/usr/bin/env node
/**
 * MCPQA MCP Server — exposes the QA framework as MCP tools.
 * Any AI agent (Claude, Cursor, etc.) can call these tools to validate
 * MCP servers, Claude Code skills, and extensions.
 *
 * Usage:
 *   mcpqa-server                          # stdio transport (default)
 *   mcpqa-server --transport http --port 3000  # HTTP transport
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "path";
import { PipelineOrchestrator } from "./core/pipeline.js";
import { PipelineConfigSchema, mergeConfigWithCLI } from "./core/config.js";
import type { PipelineReport } from "./core/types.js";
import { createGates } from "./gates/gate.factory.js";
import { createConnector } from "./connectors/factory.js";
import { BufferReporter } from "./reporting/buffer.reporter.js";

/** Blocked path prefixes — prevent directory traversal into system/sensitive dirs */
const BLOCKED_PATHS = ["/etc", "/usr", "/bin", "/sbin", "/root", "/var", "/private/etc", "/System"];

function validatePath(rawPath: string): { valid: boolean; resolved: string; error?: string } {
  const resolved = resolve(rawPath);
  for (const blocked of BLOCKED_PATHS) {
    if (resolved === blocked || resolved.startsWith(blocked + "/")) {
      return { valid: false, resolved, error: `Path "${resolved}" is blocked — cannot scan system directories` };
    }
  }
  // Block paths containing traversal sequences
  if (rawPath.includes("..")) {
    return { valid: false, resolved, error: `Path contains ".." traversal — use an absolute path` };
  }
  return { valid: true, resolved };
}

// In-memory report store
const reportStore = new Map<string, PipelineReport>();

const server = new McpServer({
  name: "mcpqa",
  version: "0.1.0",
});

// ── Tool: validate_mcp_server ──────────────────────────────────────────

server.tool(
  "validate_mcp_server",
  "Run the MCPQA pipeline (schema, security, functional validation) against an MCP server. Provide either a URL (for HTTP/SSE servers) or a command (for stdio servers).",
  {
    url: z.string().optional().describe("MCP server URL (for http/sse transport)"),
    command: z.string().optional().describe("MCP server command (for stdio transport)"),
    args: z.array(z.string()).optional().describe("Arguments for the server command"),
    transport: z.enum(["stdio", "sse", "http"]).optional().describe("Transport type"),
    gates: z.array(z.number()).optional().describe("Gate numbers to run (default: [1,2,3])"),
    mode: z.enum(["strict", "lenient"]).optional().describe("Pipeline mode"),
  },
  async (params) => {
    const config = mergeConfigWithCLI(PipelineConfigSchema.parse({}), {
      serverUrl: params.url,
      serverCmd: params.command,
      serverArgs: params.args,
      transport: params.transport,
      gates: params.gates ?? [1, 2, 3],
      mode: params.mode ?? "lenient",
    });

    const gates = createGates(config);
    const reporter = new BufferReporter(reportStore);
    const pipeline = new PipelineOrchestrator(config, gates, [reporter], createConnector);
    const report = await pipeline.run();

    return {
      content: [{ type: "text" as const, text: formatReport(report) }],
    };
  }
);

// ── Tool: validate_skill ───────────────────────────────────────────────

server.tool(
  "validate_skill",
  "Validate a Claude Code skill directory. Checks SKILL.md structure, frontmatter, description quality, content length, references, and scripts.",
  {
    path: z.string().min(1).max(4096).describe("Absolute path to the .claude/skills/skill-name/ directory"),
  },
  async (params) => {
    const pathCheck = validatePath(params.path);
    if (!pathCheck.valid) {
      return { content: [{ type: "text" as const, text: pathCheck.error! }], isError: true };
    }
    const config = mergeConfigWithCLI(PipelineConfigSchema.parse({}), {
      skillPath: pathCheck.resolved,
      gates: [6],
      transport: "null",
    });

    const gates = createGates(config);
    const reporter = new BufferReporter(reportStore);
    const pipeline = new PipelineOrchestrator(config, gates, [reporter], createConnector);
    const report = await pipeline.run();

    return {
      content: [{ type: "text" as const, text: formatReport(report) }],
    };
  }
);

// ── Tool: validate_extension ───────────────────────────────────────────

server.tool(
  "validate_extension",
  "Validate a Claude Desktop extension directory. Checks manifest.json, permissions, bundled MCP configs, and security.",
  {
    path: z.string().min(1).max(4096).describe("Absolute path to the extension directory"),
  },
  async (params) => {
    const pathCheck = validatePath(params.path);
    if (!pathCheck.valid) {
      return { content: [{ type: "text" as const, text: pathCheck.error! }], isError: true };
    }
    const config = mergeConfigWithCLI(PipelineConfigSchema.parse({}), {
      extensionPath: pathCheck.resolved,
      gates: [7],
      transport: "null",
    });

    const gates = createGates(config);
    const reporter = new BufferReporter(reportStore);
    const pipeline = new PipelineOrchestrator(config, gates, [reporter], createConnector);
    const report = await pipeline.run();

    return {
      content: [{ type: "text" as const, text: formatReport(report) }],
    };
  }
);

// ── Tool: validate_package ──────────────────────────────────────────────

server.tool(
  "validate_package",
  "Validate an npm package directory before publishing. Checks package.json, server.json, LICENSE, dependencies, and security.",
  {
    path: z.string().min(1).max(4096).describe("Absolute path to the npm package directory"),
  },
  async (params) => {
    const pathCheck = validatePath(params.path);
    if (!pathCheck.valid) {
      return { content: [{ type: "text" as const, text: pathCheck.error! }], isError: true };
    }
    const config = mergeConfigWithCLI(PipelineConfigSchema.parse({}), {
      packagePath: pathCheck.resolved,
      gates: [8],
      transport: "null",
    });

    const gates = createGates(config);
    const reporter = new BufferReporter(reportStore);
    const pipeline = new PipelineOrchestrator(config, gates, [reporter], createConnector);
    const report = await pipeline.run();

    return {
      content: [{ type: "text" as const, text: formatReport(report) }],
    };
  }
);

// ── Tool: get_report ───────────────────────────────────────────────────

server.tool(
  "get_report",
  "Retrieve a previous validation report by pipeline ID. Returns the latest report if no ID specified.",
  {
    pipelineId: z.string().optional().describe("Pipeline ID (defaults to latest)"),
  },
  async (params) => {
    let report: PipelineReport | undefined;

    if (params.pipelineId) {
      report = reportStore.get(params.pipelineId);
    } else {
      // Get the most recent
      const entries = [...reportStore.values()];
      report = entries[entries.length - 1];
    }

    if (!report) {
      return {
        content: [{ type: "text" as const, text: "No report found. Run a validation first." }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
    };
  }
);

// ── Tool: list_validators ──────────────────────────────────────────────

server.tool(
  "list_validators",
  "List all available validators across all gates with their names and descriptions.",
  {},
  async () => {
    const config = PipelineConfigSchema.parse({
      pipeline: { enabledGates: [1, 2, 3, 6, 7, 8] },
    });
    const gates = createGates(config);

    const result = gates.map((gate) => ({
      gate: gate.gateNumber,
      gateName: gate.gateName,
      validators: gate.validators.map((v) => ({
        name: v.name,
        description: v.description,
        dependencies: v.dependencies ?? [],
      })),
    }));

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Report formatting helper ───────────────────────────────────────────

function formatReport(report: PipelineReport): string {
  const lines: string[] = [];
  lines.push(`# MCPQA Report — ${report.overallSeverity.toUpperCase()}`);
  lines.push(`Pipeline: ${report.pipelineId}`);
  lines.push(`Server: ${report.serverTarget}`);
  lines.push("");

  for (const gate of report.gateResults) {
    const passed = gate.validatorResults.filter((v) => v.severity === "pass").length;
    const total = gate.validatorResults.length;
    lines.push(`## Gate ${gate.gateNumber}: ${gate.gateName} [${gate.severity.toUpperCase()}] — ${passed}/${total} passed`);

    for (const v of gate.validatorResults) {
      const icon = v.severity === "pass" ? "✓" : v.severity === "warn" ? "⚠" : v.severity === "skip" ? "○" : "✗";
      lines.push(`  ${icon} ${v.validatorName}: ${v.message}`);
      for (const e of v.evidence.slice(0, 3)) {
        lines.push(`      → ${e}`);
      }
      if (v.evidence.length > 3) {
        lines.push(`      ... and ${v.evidence.length - 3} more`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Server startup ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCPQA server failed to start:", err);
  process.exit(1);
});
