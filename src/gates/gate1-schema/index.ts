import { BaseGate } from "../../core/gate.js";
import { ProtocolConformanceValidator } from "./validators/protocol-conformance.js";
import { ToolNameValidator } from "./validators/tool-name.js";
import { ToolSchemaValidator } from "./validators/tool-schema.js";
import { DescriptionQualityValidator } from "./validators/description-quality.js";
import { ParameterTypesValidator } from "./validators/parameter-types.js";
import { JsonRpcComplianceValidator } from "./validators/jsonrpc-compliance.js";

export class SchemaGate extends BaseGate {
  readonly gateNumber = 1;
  readonly gateName = "Schema Validation";

  constructor() {
    super();
    this.registerValidator(new ProtocolConformanceValidator());
    this.registerValidator(new ToolNameValidator());
    this.registerValidator(new ToolSchemaValidator());
    this.registerValidator(new DescriptionQualityValidator());
    this.registerValidator(new ParameterTypesValidator());
    this.registerValidator(new JsonRpcComplianceValidator());
  }
}
