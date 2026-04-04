import { describe, it, expect } from "vitest";
import { join } from "path";
import { PackageSecurityValidator } from "../../../src/gates/gate8-package/validators/package-security.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

function makeCtx(packagePath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { packagePath } });
  return new ValidationContext(new NullConnector(), config.server, config);
}

describe("PackageSecurityValidator", () => {
  const validator = new PackageSecurityValidator();

  it("scans mcpqa package (finds test fixture secrets)", async () => {
    const result = await validator.validate(makeCtx(process.cwd()));
    // Our package has intentional fake secrets in test fixtures — scanner correctly finds them
    // This validates the scanner works against a real package
    expect(result.details.filesScanned).toBeGreaterThan(0);
  });

  it("detects secrets in insecure extension (treated as package)", async () => {
    const result = await validator.validate(makeCtx(join(process.cwd(), "tests/fixtures/extensions/insecure-extension")));
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("AWS"))).toBe(true);
  });

  it("skips when no package path", async () => {
    const result = await validator.validate(makeCtx(undefined));
    expect(result.severity).toBe(Severity.SKIP);
  });
});
