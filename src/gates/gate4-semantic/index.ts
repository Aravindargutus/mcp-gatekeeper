import { BaseGate } from "../../core/gate.js";
import { DescriptionAccuracyValidator } from "./validators/description-accuracy.js";
import { ParamDocClarityValidator } from "./validators/param-doc-clarity.js";
import { ResponseCompletenessValidator } from "./validators/response-completeness.js";
import { IntegrationReadinessValidator } from "./validators/integration-readiness.js";
import { ErrorMessageQualityValidator } from "./validators/error-message-quality.js";
import { ToolChainDiscoveryValidator } from "./validators/tool-chain-discovery.js";
import { HolisticSummaryValidator } from "./validators/holistic-summary.js";

export class SemanticGate extends BaseGate {
  readonly gateNumber = 4;
  readonly gateName = "AI Semantic Evaluation";

  constructor() {
    super();
    // Per-tool evaluators (run first, produce scores + fixes)
    this.registerValidator(new DescriptionAccuracyValidator());
    this.registerValidator(new ParamDocClarityValidator());
    this.registerValidator(new ResponseCompletenessValidator());
    this.registerValidator(new IntegrationReadinessValidator());
    this.registerValidator(new ErrorMessageQualityValidator());
    this.registerValidator(new ToolChainDiscoveryValidator());
    // Holistic summary (runs LAST — cross-references all gates into one improvement plan)
    this.registerValidator(new HolisticSummaryValidator());
  }
}
