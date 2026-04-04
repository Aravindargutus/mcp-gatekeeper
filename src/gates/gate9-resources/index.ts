import { BaseGate } from "../../core/gate.js";
import { ResourceMetadataValidator } from "./validators/resource-metadata.js";
import { ResourceUriSchemeValidator } from "./validators/resource-uri-scheme.js";
import { ResourceDescriptionValidator } from "./validators/resource-description.js";

export class ResourcesGate extends BaseGate {
  readonly gateNumber = 9;
  readonly gateName = "Resources Validation";

  constructor() {
    super();
    this.registerValidator(new ResourceMetadataValidator());
    this.registerValidator(new ResourceUriSchemeValidator());
    this.registerValidator(new ResourceDescriptionValidator());
  }
}
