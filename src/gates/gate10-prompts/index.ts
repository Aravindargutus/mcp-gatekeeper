import { BaseGate } from "../../core/gate.js";
import { PromptMetadataValidator } from "./validators/prompt-metadata.js";
import { PromptArgumentsValidator } from "./validators/prompt-arguments.js";
import { PromptSecurityValidator } from "./validators/prompt-security.js";

export class PromptsGate extends BaseGate {
  readonly gateNumber = 10;
  readonly gateName = "Prompts Validation";

  constructor() {
    super();
    this.registerValidator(new PromptMetadataValidator());
    this.registerValidator(new PromptArgumentsValidator());
    this.registerValidator(new PromptSecurityValidator());
  }
}
