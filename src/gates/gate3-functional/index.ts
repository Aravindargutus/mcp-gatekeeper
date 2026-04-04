import { BaseGate } from "../../core/gate.js";
import { HandshakeValidator } from "./validators/handshake.js";
import { ToolInvocationValidator } from "./validators/tool-invocation.js";
import { BoundaryTestingValidator } from "./validators/boundary-testing.js";
import { ErrorFormatValidator } from "./validators/error-format.js";
import { ParameterHandlingValidator } from "./validators/parameter-handling.js";
import { ContentTypesValidator } from "./validators/content-types.js";
import { PaginationValidator } from "./validators/pagination.js";
import { TimeoutValidator } from "./validators/timeout.js";
import { IdempotencyValidator } from "./validators/idempotency.js";

export class FunctionalGate extends BaseGate {
  readonly gateNumber = 3;
  readonly gateName = "Functional Validation";

  constructor() {
    super();
    this.registerValidator(new HandshakeValidator());
    this.registerValidator(new ToolInvocationValidator());
    this.registerValidator(new BoundaryTestingValidator());
    this.registerValidator(new ErrorFormatValidator());
    this.registerValidator(new ParameterHandlingValidator());
    this.registerValidator(new ContentTypesValidator());
    this.registerValidator(new PaginationValidator());
    this.registerValidator(new TimeoutValidator());
    this.registerValidator(new IdempotencyValidator());
  }
}
