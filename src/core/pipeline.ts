/**
 * PipelineOrchestrator — Chain of Responsibility pattern.
 *
 * In strict mode, any gate failure halts the pipeline immediately.
 * In lenient mode, all gates run and results are aggregated.
 *
 * Timeout enforcement:
 * - Pipeline-level hard ceiling (config.pipeline.timeoutSeconds)
 * - Per-gate timeout (config.pipeline.gateTimeoutSeconds, default 300s)
 * Both use AbortController for clean cancellation.
 *
 * Exit codes: 0 = all passed, 1 = at least one failed, 2 = pending review.
 */

import { v4 as uuidv4 } from "uuid";
import type { IGate, IMCPConnector, IReporter } from "./interfaces.js";
import type { PipelineReport, GateResult } from "./types.js";
import { Severity, worstSeverity, isBlocking } from "./types.js";
import { ValidationContext } from "./context.js";
import type { PipelineConfig, ServerTarget } from "./config.js";
import { BaseGate } from "./gate.js";

export class PipelineOrchestrator {
  constructor(
    private readonly config: PipelineConfig,
    private readonly gates: IGate[],
    private readonly reporters: IReporter[],
    private readonly connectorFactory: (target: ServerTarget) => IMCPConnector
  ) {}

  async run(serverTarget?: ServerTarget): Promise<PipelineReport> {
    const target = serverTarget ?? this.config.server;
    const connector = this.connectorFactory(target);

    const report: PipelineReport = {
      pipelineId: uuidv4(),
      serverTarget: target.command ?? target.url ?? "unknown",
      gateResults: [],
      overallSeverity: Severity.PASS,
      startedAt: new Date().toISOString(),
      completedAt: null,
      configSnapshot: this.sanitizeConfig(this.config),
    };

    // Pipeline-level timeout (hard ceiling)
    const pipelineTimeoutMs = this.config.pipeline.timeoutSeconds * 1000;
    const pipelineAbort = new AbortController();
    const pipelineTimer = setTimeout(() => pipelineAbort.abort(), pipelineTimeoutMs);

    try {
      const initResult = await connector.connect();
      const ctx = new ValidationContext(connector, target, this.config);
      ctx.initializeResult = initResult;
      ctx.serverCapabilities = initResult.capabilities;
      ctx.toolDefinitions = await connector.listTools();

      const enabledGates = this.gates
        .filter((g) => this.config.pipeline.enabledGates.includes(g.gateNumber))
        .sort((a, b) => a.gateNumber - b.gateNumber);

      for (const gate of enabledGates) {
        // Check pipeline-level abort
        if (pipelineAbort.signal.aborted) {
          report.gateResults.push(this.makeTimeoutGateResult(gate, "pipeline timeout exceeded"));
          continue;
        }

        if (gate instanceof BaseGate) {
          gate.setReporters(this.reporters);
        }

        this.reporters.forEach((r) => r.onGateStart(gate.gateNumber, gate.gateName));

        // Per-gate timeout
        const gateTimeoutMs = (this.config.pipeline.gateTimeoutSeconds ?? 300) * 1000;
        const gateAbort = new AbortController();
        const gateTimer = setTimeout(() => gateAbort.abort(), gateTimeoutMs);

        // Link gate abort to pipeline abort
        const onPipelineAbort = () => gateAbort.abort();
        pipelineAbort.signal.addEventListener("abort", onPipelineAbort, { once: true });

        let gateResult: GateResult;
        try {
          gateResult = await gate.execute(ctx, gateAbort.signal);
        } catch (err) {
          gateResult = this.makeTimeoutGateResult(
            gate,
            err instanceof Error ? err.message : "Gate execution failed"
          );
        } finally {
          clearTimeout(gateTimer);
          pipelineAbort.signal.removeEventListener("abort", onPipelineAbort);
        }

        // If gate timed out, mark it
        if (gateAbort.signal.aborted && !isBlocking(gateResult!.severity)) {
          gateResult!.severity = Severity.FAIL;
          gateResult!.metadata.timedOut = true;
        }

        report.gateResults.push(gateResult!);
        ctx.addGateResult(gateResult!);
        this.reporters.forEach((r) => r.onGateComplete(gateResult!));

        if (isBlocking(gateResult!.severity) && this.config.pipeline.mode === "strict") {
          report.overallSeverity = gateResult!.severity;
          break;
        }
      }

      report.overallSeverity = worstSeverity(report.gateResults.map((r) => r.severity));
    } catch (err) {
      report.overallSeverity = Severity.ERROR;
      report.gateResults.push({
        gateNumber: 0,
        gateName: "pipeline-setup",
        severity: Severity.ERROR,
        validatorResults: [
          {
            validatorName: "connection",
            severity: Severity.ERROR,
            message: err instanceof Error ? err.message : "Unknown error during pipeline setup",
            details: { error: this.sanitizeStack(err instanceof Error ? err.stack : String(err)) },
            durationMs: 0,
            evidence: [],
          },
        ],
        durationMs: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        metadata: {},
      });
    } finally {
      clearTimeout(pipelineTimer);
      try {
        if (connector.isConnected) {
          await connector.disconnect();
        }
      } catch {
        // Swallow disconnect errors
      }
    }

    report.completedAt = new Date().toISOString();

    for (const reporter of this.reporters) {
      await reporter.finalize(report);
    }

    return report;
  }

  getExitCode(report: PipelineReport): number {
    switch (report.overallSeverity) {
      case Severity.PASS:
      case Severity.WARN:
      case Severity.SKIP:
        return 0;
      case Severity.FAIL:
      case Severity.ERROR:
        return 1;
      default:
        return 1;
    }
  }

  /** Strip sensitive fields from config before persisting in reports. */
  private sanitizeConfig(config: PipelineConfig): Record<string, unknown> {
    const clone = JSON.parse(JSON.stringify(config));
    if (clone.server?.headers && Object.keys(clone.server.headers).length > 0) {
      clone.server.headers = "[redacted]";
    }
    if (clone.server?.env && Object.keys(clone.server.env).length > 0) {
      clone.server.env = "[redacted]";
    }
    if (clone.server?.sessionId) {
      clone.server.sessionId = "[redacted]";
    }
    return clone;
  }

  /** Strip absolute local paths from stack traces to prevent information disclosure. */
  private sanitizeStack(stack: string | undefined): string {
    if (!stack) return "unknown error";
    return stack.replace(/\(\/[^)]+\)/g, "(redacted)");
  }

  private makeTimeoutGateResult(gate: IGate, reason: string): GateResult {
    const now = new Date().toISOString();
    return {
      gateNumber: gate.gateNumber,
      gateName: gate.gateName,
      severity: Severity.FAIL,
      validatorResults: [
        {
          validatorName: "timeout",
          severity: Severity.FAIL,
          message: `Gate ${gate.gateNumber} aborted: ${reason}`,
          details: {},
          durationMs: 0,
          evidence: [reason],
        },
      ],
      durationMs: 0,
      startedAt: now,
      completedAt: now,
      metadata: { timedOut: true },
    };
  }
}
