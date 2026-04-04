import { describe, it, expect } from "vitest";
import { DependencyAuditValidator } from "../../../src/gates/gate8-package/validators/dependency-audit.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

function makeCtx(packagePath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { packagePath } });
  return new ValidationContext(new NullConnector(), config.server, config);
}

describe("DependencyAuditValidator", () => {
  const validator = new DependencyAuditValidator();

  it("audits mcpqa own dependencies", async () => {
    const result = await validator.validate(makeCtx(process.cwd()));
    // May find base64 strings in lockfile that trigger secret patterns — that's the scanner working
    expect(result.details.depCount).toBeGreaterThan(0);
    expect(result.details.devDepCount).toBeGreaterThan(0);
  });

  it("skips when no package path", async () => {
    const result = await validator.validate(makeCtx(undefined));
    expect(result.severity).toBe(Severity.SKIP);
  });
});
