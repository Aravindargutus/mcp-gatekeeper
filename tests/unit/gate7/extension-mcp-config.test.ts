import { describe, it, expect } from "vitest";
import { join } from "path";
import { ExtensionMcpConfigValidator } from "../../../src/gates/gate7-extensions/validators/extension-mcp-config.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

const FIXTURES = join(process.cwd(), "tests/fixtures/extensions");

function makeCtx(extensionPath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { extensionPath } });
  return new ValidationContext(new NullConnector(), config.server, config);
}

describe("ExtensionMcpConfigValidator", () => {
  const validator = new ExtensionMcpConfigValidator();

  it("passes when no MCP servers bundled", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "valid-extension")));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("skips when no extension path", async () => {
    const result = await validator.validate(makeCtx(undefined));
    expect(result.severity).toBe(Severity.SKIP);
  });
});
