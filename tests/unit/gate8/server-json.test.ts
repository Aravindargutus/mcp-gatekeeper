import { describe, it, expect } from "vitest";
import { join } from "path";
import { ServerJsonValidator } from "../../../src/gates/gate8-package/validators/server-json.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

function makeCtx(packagePath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { packagePath } });
  return new ValidationContext(new NullConnector(), config.server, config);
}

describe("ServerJsonValidator", () => {
  const validator = new ServerJsonValidator();

  it("passes for mcpqa own server.json", async () => {
    const result = await validator.validate(makeCtx(process.cwd()));
    expect([Severity.PASS, Severity.WARN]).toContain(result.severity);
  });

  it("warns when no server.json exists", async () => {
    const result = await validator.validate(makeCtx(join(process.cwd(), "tests/fixtures/extensions/valid-extension")));
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence.some((e) => e.includes("server.json"))).toBe(true);
  });

  it("skips when no package path", async () => {
    const result = await validator.validate(makeCtx(undefined));
    expect(result.severity).toBe(Severity.SKIP);
  });
});
