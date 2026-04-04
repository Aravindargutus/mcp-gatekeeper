import { describe, it, expect } from "vitest";
import { join } from "path";
import { ExtensionPermissionsValidator } from "../../../src/gates/gate7-extensions/validators/extension-permissions.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

const FIXTURES = join(process.cwd(), "tests/fixtures/extensions");

function makeCtx(extensionPath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { extensionPath } });
  return new ValidationContext(new NullConnector(), config.server, config);
}

describe("ExtensionPermissionsValidator", () => {
  const validator = new ExtensionPermissionsValidator();

  it("passes for scoped permissions", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "valid-extension")));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("warns for wildcard permissions", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "insecure-extension")));
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("Wildcard"))).toBe(true);
    expect(result.evidence.some((e) => e.includes("filesystem:*"))).toBe(true);
  });
});
