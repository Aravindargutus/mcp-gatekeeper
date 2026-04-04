import { BaseGate } from "../../core/gate.js";
import { PromptInjectionValidator } from "./validators/prompt-injection.js";
import { SSRFDetectorValidator } from "./validators/ssrf-detector.js";
import { SecretScannerValidator } from "./validators/secret-scanner.js";
import { PermissionScopeValidator } from "./validators/permission-scope.js";
import { DangerousPatternsValidator } from "./validators/dangerous-patterns.js";
import { InputSanitizationValidator } from "./validators/input-sanitization.js";
import { RateLimitValidator } from "./validators/rate-limit.js";
import { AuthCheckValidator } from "./validators/auth-check.js";
import { DynamicInjectionValidator } from "./validators/dynamic-injection.js";

export class SecurityGate extends BaseGate {
  readonly gateNumber = 2;
  readonly gateName = "Security Validation";

  constructor() {
    super();
    // Static analysis validators (run on tool definitions only)
    this.registerValidator(new PromptInjectionValidator());
    this.registerValidator(new SSRFDetectorValidator());
    this.registerValidator(new SecretScannerValidator());
    this.registerValidator(new PermissionScopeValidator());
    this.registerValidator(new DangerousPatternsValidator());
    this.registerValidator(new InputSanitizationValidator());
    this.registerValidator(new RateLimitValidator());
    this.registerValidator(new AuthCheckValidator());
    // Dynamic security validator (actually invokes tools with injection payloads)
    this.registerValidator(new DynamicInjectionValidator());
  }
}
