import { BaseGate } from "../../core/gate.js";
import { ExtensionManifestValidator } from "./validators/extension-manifest.js";
import { ExtensionPermissionsValidator } from "./validators/extension-permissions.js";
import { ExtensionMcpConfigValidator } from "./validators/extension-mcp-config.js";
import { ExtensionSecurityValidator } from "./validators/extension-security.js";

export class ExtensionsGate extends BaseGate {
  readonly gateNumber = 7;
  readonly gateName = "Extensions Validation";

  constructor() {
    super();
    this.registerValidator(new ExtensionManifestValidator());
    this.registerValidator(new ExtensionPermissionsValidator());
    this.registerValidator(new ExtensionMcpConfigValidator());
    this.registerValidator(new ExtensionSecurityValidator());
  }
}
