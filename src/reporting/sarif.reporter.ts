import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { BaseReporter } from "./base.reporter.js";
import type { GateResult, PipelineReport, ValidatorResult } from "../core/types.js";
import { Severity } from "../core/types.js";
import { logger } from "../utils/logger.js";

/**
 * SARIF (Static Analysis Results Interchange Format) reporter.
 * Outputs findings in SARIF v2.1.0 — the standard consumed by:
 * - GitHub Code Scanning
 * - VS Code SARIF Viewer
 * - Azure DevOps
 * - SonarQube
 */

const SEVERITY_TO_SARIF_LEVEL: Record<Severity, string> = {
  [Severity.PASS]: "none",
  [Severity.SKIP]: "none",
  [Severity.WARN]: "warning",
  [Severity.FAIL]: "error",
  [Severity.ERROR]: "error",
};

export class SarifReporter extends BaseReporter {
  constructor(private readonly outputDir: string) {
    super();
  }

  onGateStart(_gateNumber: number, _gateName: string): void {}
  onGateComplete(_result: GateResult): void {}
  onValidatorComplete(_result: ValidatorResult): void {}

  async finalize(report: PipelineReport): Promise<void> {
    try {
      mkdirSync(this.outputDir, { recursive: true });
    } catch (err) {
      logger.error(`Failed to create SARIF output directory: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const sarif = this.buildSarif(report);

    try {
      const json = JSON.stringify(sarif, null, 2);
      writeFileSync(join(this.outputDir, `mcpqa-${report.pipelineId}.sarif`), json);
      writeFileSync(join(this.outputDir, "latest.sarif"), json);
      logger.debug("SARIF report written");
    } catch (err) {
      logger.error(`Failed to write SARIF report: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private buildSarif(report: PipelineReport): Record<string, unknown> {
    const rules: Array<Record<string, unknown>> = [];
    const results: Array<Record<string, unknown>> = [];
    const ruleIndex = new Map<string, number>();

    for (const gate of report.gateResults) {
      for (const v of gate.validatorResults) {
        if (v.severity === Severity.PASS || v.severity === Severity.SKIP) continue;

        // Register rule if not already
        const ruleId = `mcpqa/${gate.gateName.toLowerCase().replace(/\s+/g, "-")}/${v.validatorName}`;
        if (!ruleIndex.has(ruleId)) {
          ruleIndex.set(ruleId, rules.length);
          rules.push({
            id: ruleId,
            name: v.validatorName,
            shortDescription: { text: v.message },
            fullDescription: { text: `Gate ${gate.gateNumber} (${gate.gateName}): ${v.validatorName}` },
            defaultConfiguration: { level: SEVERITY_TO_SARIF_LEVEL[v.severity] },
            properties: {
              tags: [gate.gateName.toLowerCase().replace(/\s+/g, "-"), v.severity],
            },
          });
        }

        // Create a result for each evidence item
        if (v.evidence.length === 0) {
          results.push({
            ruleId,
            ruleIndex: ruleIndex.get(ruleId),
            level: SEVERITY_TO_SARIF_LEVEL[v.severity],
            message: { text: v.message },
            properties: {
              gate: gate.gateNumber,
              gateName: gate.gateName,
              durationMs: v.durationMs,
            },
          });
        } else {
          for (const evidence of v.evidence) {
            results.push({
              ruleId,
              ruleIndex: ruleIndex.get(ruleId),
              level: SEVERITY_TO_SARIF_LEVEL[v.severity],
              message: { text: evidence },
              properties: {
                gate: gate.gateNumber,
                gateName: gate.gateName,
              },
            });
          }
        }
      }
    }

    return {
      $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "mcpqa",
              version: "0.1.0",
              informationUri: "https://github.com/Aravindargutus/mcp-gatekeeper",
              rules,
            },
          },
          results,
          invocations: [
            {
              executionSuccessful: report.overallSeverity !== Severity.ERROR,
              startTimeUtc: report.startedAt,
              endTimeUtc: report.completedAt,
              properties: {
                pipelineId: report.pipelineId,
                serverTarget: report.serverTarget,
                overallSeverity: report.overallSeverity,
              },
            },
          ],
        },
      ],
    };
  }
}
