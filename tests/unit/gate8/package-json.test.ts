import { describe, it, expect } from "vitest";
import { join } from "path";
import { PackageJsonValidator } from "../../../src/gates/gate8-package/validators/package-json.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

function makeCtx(packagePath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { packagePath } });
  return new ValidationContext(new NullConnector(), config.server, config);
}

describe("PackageJsonValidator", () => {
  const validator = new PackageJsonValidator();

  it("passes for the mcpqa package itself", async () => {
    const result = await validator.validate(makeCtx(process.cwd()));
    // Our own package.json should pass (it has name, version, description, bin, keywords)
    expect([Severity.PASS, Severity.WARN]).toContain(result.severity);
    expect(result.details.name).toBe("mcpqa");
  });

  it("fails for directory without package.json", async () => {
    const result = await validator.validate(makeCtx(join(process.cwd(), "tests/fixtures/skills/empty-skill")));
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("skips when no package path", async () => {
    const result = await validator.validate(makeCtx(undefined));
    expect(result.severity).toBe(Severity.SKIP);
  });
});
