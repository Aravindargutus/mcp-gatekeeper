#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, mergeConfigWithCLI, PipelineConfigSchema } from "./core/config.js";
import { PipelineOrchestrator } from "./core/pipeline.js";
import { createGates } from "./gates/gate.factory.js";
import { createConnector } from "./connectors/factory.js";
import { ConsoleReporter } from "./reporting/console.reporter.js";
import { JsonReporter } from "./reporting/json.reporter.js";
import { HtmlReporter } from "./reporting/html.reporter.js";
import type { IReporter } from "./core/interfaces.js";
import { setLogLevel, LogLevel } from "./utils/logger.js";

const program = new Command();

program
  .name("mcpqa")
  .description("MCP QA Framework — 5-Gated Pipeline for validating MCP servers")
  .version("0.1.0");

program
  .command("run")
  .description("Run the QA pipeline against an MCP server")
  .option("-c, --config <path>", "Path to YAML config file")
  .option("--server-cmd <command>", "MCP server command (stdio transport)")
  .option("--server-args <args>", "MCP server arguments (comma-separated)")
  .option("--server-url <url>", "MCP server URL (http or sse transport)")
  .option("--transport <type>", "Transport type: stdio, sse, http, mock", "stdio")
  .option("--headers <json>", "HTTP headers as JSON string (for http/sse transport)")
  .option("--skill-path <path>", "Path to Claude Code skill directory (runs Gate 6)")
  .option("--extension-path <path>", "Path to extension directory (runs Gate 7)")
  .option("--gates <numbers>", "Comma-separated gate numbers to run (e.g., 1,2,3,6,7)")
  .option("--mode <mode>", "Pipeline mode: strict or lenient", "strict")
  .option("--output-dir <dir>", "Report output directory", "./reports")
  .option("--verbose", "Show detailed progress logs")
  .option("--debug", "Show debug-level logs (most verbose)")
  .option("--dry-run", "Validate config and show what would run without executing")
  .action(async (opts) => {
    try {
      // Set log level
      if (opts.debug) setLogLevel(LogLevel.DEBUG);
      else if (opts.verbose) setLogLevel(LogLevel.INFO);
      else setLogLevel(LogLevel.WARN);

      // Load config
      let config = opts.config
        ? loadConfig(opts.config)
        : PipelineConfigSchema.parse({});

      // Parse headers if provided
      let headers: Record<string, string> | undefined;
      if (opts.headers) {
        try {
          headers = JSON.parse(opts.headers);
        } catch {
          console.error(chalk.red("Error: --headers must be valid JSON"));
          process.exit(1);
        }
      }

      // If --server-url given without explicit --transport, default to http
      const transport = opts.transport === "stdio" && opts.serverUrl
        ? "http"
        : opts.transport;

      // Apply CLI overrides
      config = mergeConfigWithCLI(config, {
        gates: opts.gates
          ? opts.gates.split(",").map(Number)
          : undefined,
        mode: opts.mode,
        serverCmd: opts.serverCmd,
        serverArgs: opts.serverArgs?.split(","),
        serverUrl: opts.serverUrl,
        transport,
        headers,
        skillPath: opts.skillPath,
        extensionPath: opts.extensionPath,
      });

      // Validate we have at least one target
      const hasServerTarget = config.server.command || config.server.url;
      const hasFileTarget = config.server.skillPath || config.server.extensionPath;
      if (!hasServerTarget && !hasFileTarget && config.server.transport !== "mock") {
        console.error(
          chalk.red("Error: No target specified. Use --server-cmd, --server-url, --skill-path, --extension-path, or --config")
        );
        process.exit(1);
      }

      // Create reporters
      const reporters: IReporter[] = [new ConsoleReporter()];
      const outputDir = opts.outputDir ?? config.reporting.outputDir;

      if (config.reporting.formats.includes("json")) {
        reporters.push(new JsonReporter(outputDir));
      }
      if (config.reporting.formats.includes("html")) {
        reporters.push(new HtmlReporter(outputDir));
      }

      // Create gates and pipeline
      const gates = createGates(config);
      const pipeline = new PipelineOrchestrator(
        config,
        gates,
        reporters,
        createConnector
      );

      console.log(chalk.bold.cyan("\n╔══════════════════════════════════════╗"));
      console.log(chalk.bold.cyan("║       MCPQA — Pipeline Runner        ║"));
      console.log(chalk.bold.cyan("╚══════════════════════════════════════╝"));
      console.log(`  Server:  ${config.server.command ?? config.server.url ?? "file-only"}`);
      console.log(`  Gates:   ${config.pipeline.enabledGates.join(", ")}`);
      console.log(`  Mode:    ${config.pipeline.mode}`);
      if (config.server.skillPath) console.log(`  Skill:   ${config.server.skillPath}`);
      if (config.server.extensionPath) console.log(`  Ext:     ${config.server.extensionPath}`);
      console.log(`  Timeout: ${config.pipeline.timeoutSeconds}s pipeline, ${config.pipeline.gateTimeoutSeconds}s per gate`);

      // Dry-run: show config and exit
      if (opts.dryRun) {
        console.log(chalk.yellow("\n  --dry-run: Config validated. Would run the above pipeline."));
        console.log(`  Validators: ${gates.reduce((sum, g) => sum + g.validators.length, 0)} total`);
        process.exit(0);
      }

      // Run pipeline
      const report = await pipeline.run();
      const exitCode = pipeline.getExitCode(report);
      process.exit(exitCode);
    } catch (err) {
      console.error(chalk.red(`\nFatal error: ${err instanceof Error ? err.message : String(err)}`));
      if (err instanceof Error && err.stack) {
        console.error(chalk.gray(err.stack));
      }
      process.exit(1);
    }
  });

program
  .command("validate-config")
  .description("Validate a YAML config file")
  .argument("<path>", "Path to config file")
  .action((configPath) => {
    try {
      const config = loadConfig(configPath);
      console.log(chalk.green("Config is valid!"));
      console.log(`  Gates: ${config.pipeline.enabledGates.join(", ")}`);
      console.log(`  Mode:  ${config.pipeline.mode}`);
      console.log(`  Transport: ${config.server.transport}`);
    } catch (err) {
      console.error(chalk.red(`Invalid config: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program.parse();
