import { BaseGate } from "../../core/gate.js";
import type { ValidationContext } from "../../core/context.js";
import type { GateResult } from "../../core/types.js";
import { DescriptionAccuracyValidator } from "./validators/description-accuracy.js";
import { ParamDocClarityValidator } from "./validators/param-doc-clarity.js";
import { ResponseCompletenessValidator } from "./validators/response-completeness.js";
import { IntegrationReadinessValidator } from "./validators/integration-readiness.js";
import { ErrorMessageQualityValidator } from "./validators/error-message-quality.js";
import { ToolChainDiscoveryValidator } from "./validators/tool-chain-discovery.js";
import { HolisticSummaryValidator } from "./validators/holistic-summary.js";
import { TranscriptRecorder } from "./transcript.js";
import { logger } from "../../utils/logger.js";

/**
 * Gate 4: AI Semantic Evaluation
 *
 * Manages shared infrastructure for all LLM-based validators:
 * - TranscriptRecorder (saves full LLM conversations for debugging)
 * - Trial count from config (pass@k evaluation)
 * - Transcript persistence after all validators complete
 */
export class SemanticGate extends BaseGate {
  readonly gateNumber = 4;
  readonly gateName = "AI Semantic Evaluation";
  private transcriptRecorder = new TranscriptRecorder();

  constructor() {
    super();
    this.registerValidator(new DescriptionAccuracyValidator());
    this.registerValidator(new ParamDocClarityValidator());
    this.registerValidator(new ResponseCompletenessValidator());
    this.registerValidator(new IntegrationReadinessValidator());
    this.registerValidator(new ErrorMessageQualityValidator());
    this.registerValidator(new ToolChainDiscoveryValidator());
    this.registerValidator(new HolisticSummaryValidator());
  }

  async execute(ctx: ValidationContext, signal?: AbortSignal): Promise<GateResult> {
    // Make transcript recorder available to validators via context
    ctx.transcriptRecorder = this.transcriptRecorder;
    ctx.trials = (ctx.config as Record<string, unknown> & { semantic?: { trials?: number } }).semantic?.trials ?? 1;

    const result = await super.execute(ctx, signal);

    // Save transcripts after all validators complete
    try {
      const outputDir = ctx.config.reporting.outputDir;
      const pipelineId = ctx.gateResults[0]?.startedAt ?? new Date().toISOString();
      this.transcriptRecorder.save(outputDir, pipelineId.replace(/[^a-zA-Z0-9]/g, "-"));
      logger.info(`Gate 4 transcripts: ${this.transcriptRecorder.getEntries().length} entries saved`);
    } catch (err) {
      logger.error(`Failed to save Gate 4 transcripts: ${err instanceof Error ? err.message : String(err)}`);
    }

    return result;
  }
}
