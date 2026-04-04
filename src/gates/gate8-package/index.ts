import { BaseGate } from "../../core/gate.js";
import { PackageJsonValidator } from "./validators/package-json.js";
import { ServerJsonValidator } from "./validators/server-json.js";
import { LicenseCheckValidator } from "./validators/license-check.js";
import { DependencyAuditValidator } from "./validators/dependency-audit.js";
import { PackageSecurityValidator } from "./validators/package-security.js";

export class PackageGate extends BaseGate {
  readonly gateNumber = 8;
  readonly gateName = "Package Validation";

  constructor() {
    super();
    this.registerValidator(new PackageJsonValidator());
    this.registerValidator(new ServerJsonValidator());
    this.registerValidator(new LicenseCheckValidator());
    this.registerValidator(new DependencyAuditValidator());
    this.registerValidator(new PackageSecurityValidator());
  }
}
