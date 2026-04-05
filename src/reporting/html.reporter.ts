import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { BaseReporter } from "./base.reporter.js";
import type { GateResult, PipelineReport, ValidatorResult } from "../core/types.js";
import { Severity } from "../core/types.js";
import { logger } from "../utils/logger.js";

export class HtmlReporter extends BaseReporter {
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
      logger.error(`Failed to create report directory: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const html = this.renderReport(report);
    const filename = `mcpqa-${report.pipelineId}.html`;
    try {
      writeFileSync(join(this.outputDir, filename), html);
      writeFileSync(join(this.outputDir, "latest.html"), html);
    } catch (err) {
      logger.error(`Failed to write HTML report: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private renderReport(report: PipelineReport): string {
    const severityColor: Record<string, string> = {
      pass: "#22c55e", warn: "#eab308", fail: "#ef4444",
      skip: "#6b7280", error: "#a855f7",
    };

    const gateRows = report.gateResults
      .map((gate) => {
        const validatorRows = gate.validatorResults
          .map((v) => {
            const evidenceHtml = v.evidence.length > 0
              ? `<ul class="evidence">${v.evidence.map((e) => `<li>${this.escape(e)}</li>`).join("")}</ul>`
              : "";
            return `<tr>
              <td><span class="badge" style="background:${severityColor[v.severity]}">${v.severity.toUpperCase()}</span></td>
              <td>${this.escape(v.validatorName)}</td>
              <td>${this.escape(v.message)}${evidenceHtml}</td>
              <td>${v.durationMs.toFixed(0)}ms</td>
            </tr>`;
          })
          .join("");

        return `<div class="gate">
          <h2>
            <span class="badge" style="background:${severityColor[gate.severity]}">${gate.severity.toUpperCase()}</span>
            Gate ${gate.gateNumber}: ${this.escape(gate.gateName)}
            <span class="duration">${gate.durationMs.toFixed(0)}ms</span>
          </h2>
          <table><thead><tr><th>Status</th><th>Validator</th><th>Message</th><th>Duration</th></tr></thead>
          <tbody>${validatorRows}</tbody></table>
        </div>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCPQA Report — ${report.pipelineId}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #38bdf8; }
  .summary { background: #1e293b; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; overflow: hidden; }
  .summary dl { min-width: 0; }
  .summary dt { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
  .summary dd { font-size: 0.95rem; font-weight: 600; word-break: break-all; overflow-wrap: anywhere; }
  .gate { background: #1e293b; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; }
  .gate h2 { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; font-size: 1.1rem; flex-wrap: wrap; }
  .duration { color: #64748b; font-size: 0.8rem; margin-left: auto; font-weight: normal; }
  .badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; color: white; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { text-align: left; color: #94a3b8; font-size: 0.8rem; padding: 0.5rem; border-bottom: 1px solid #334155; }
  th:nth-child(1) { width: 70px; }
  th:nth-child(2) { width: 180px; }
  th:nth-child(4) { width: 80px; }
  td { padding: 0.5rem; border-bottom: 1px solid #1e293b; font-size: 0.9rem; word-break: break-word; overflow-wrap: anywhere; vertical-align: top; }
  .evidence { margin-top: 0.5rem; padding-left: 1.5rem; color: #94a3b8; font-size: 0.8rem; }
  .evidence li { margin-bottom: 0.25rem; word-break: break-word; }
</style></head>
<body>
  <h1>MCPQA Pipeline Report</h1>
  <div class="summary">
    <dl><dt>Pipeline ID</dt><dd>${report.pipelineId}</dd></dl>
    <dl><dt>Server</dt><dd>${this.escape(report.serverTarget)}</dd></dl>
    <dl><dt>Overall</dt><dd><span class="badge" style="background:${severityColor[report.overallSeverity]}">${report.overallSeverity.toUpperCase()}</span></dd></dl>
    <dl><dt>Started</dt><dd>${report.startedAt}</dd></dl>
    <dl><dt>Completed</dt><dd>${report.completedAt ?? "—"}</dd></dl>
  </div>
  ${gateRows}
</body></html>`;
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
