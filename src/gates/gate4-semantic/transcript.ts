import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { logger } from "../../utils/logger.js";
import type { JudgeVerdict, TrialResult } from "./llm-judge.js";

export interface TranscriptEntry {
  timestamp: string;
  toolName: string;
  validatorName: string;
  prompt: string;
  verdict: JudgeVerdict;
  trialIndex?: number;
  durationMs: number;
}

/**
 * TranscriptRecorder — saves full LLM evaluation conversations for debugging.
 *
 * From Anthropic's eval article: "Read transcripts regularly — verify graders
 * work as intended through manual review." Without transcripts, a score of 2/5
 * is a black box. With transcripts, you can see exactly what the LLM saw and
 * why it scored that way.
 */
export class TranscriptRecorder {
  private entries: TranscriptEntry[] = [];

  record(entry: TranscriptEntry): void {
    this.entries.push(entry);
  }

  recordTrials(
    toolName: string,
    validatorName: string,
    prompt: string,
    result: TrialResult,
    durationMs: number
  ): void {
    for (let i = 0; i < result.trials.length; i++) {
      this.entries.push({
        timestamp: new Date().toISOString(),
        toolName,
        validatorName,
        prompt,
        verdict: result.trials[i],
        trialIndex: result.trials.length > 1 ? i : undefined,
        durationMs: Math.round(durationMs / result.trials.length),
      });
    }
  }

  /** Save all transcripts to disk. Called by the gate after all validators run. */
  save(outputDir: string, pipelineId: string): void {
    if (this.entries.length === 0) return;

    const dir = join(outputDir, "transcripts");
    try {
      mkdirSync(dir, { recursive: true });

      const filename = `gate4-${pipelineId}.json`;
      const data = {
        pipelineId,
        generatedAt: new Date().toISOString(),
        entryCount: this.entries.length,
        entries: this.entries.map((e) => ({
          timestamp: e.timestamp,
          tool: e.toolName,
          validator: e.validatorName,
          trial: e.trialIndex,
          score: e.verdict.score,
          verdict: e.verdict.verdict,
          reasoning: e.verdict.reasoning,
          fixes: e.verdict.fixes,
          durationMs: e.durationMs,
          // Save full prompt + raw LLM response for debugging
          prompt: e.prompt,
          rawResponse: e.verdict.raw,
        })),
      };

      writeFileSync(join(dir, filename), JSON.stringify(data, null, 2));
      writeFileSync(join(dir, "latest-gate4.json"), JSON.stringify(data, null, 2));
      logger.info(`Gate 4 transcripts saved: ${this.entries.length} entries → ${dir}/${filename}`);
    } catch (err) {
      logger.error(`Failed to save transcripts: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  getEntries(): TranscriptEntry[] {
    return [...this.entries];
  }
}
