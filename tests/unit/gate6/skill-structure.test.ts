import { describe, it, expect } from "vitest";
import { join } from "path";
import { SkillStructureValidator } from "../../../src/gates/gate6-skills/validators/skill-structure.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

const FIXTURES = join(process.cwd(), "tests/fixtures/skills");

function makeCtx(skillPath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { skillPath } });
  const ctx = new ValidationContext(new NullConnector(), config.server, config);
  return ctx;
}

describe("SkillStructureValidator", () => {
  const validator = new SkillStructureValidator();

  it("passes for valid skill directory", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "valid-skill")));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("fails when SKILL.md is missing", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "empty-skill")));
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.evidence.some((e) => e.includes("SKILL.md"))).toBe(true);
  });

  it("fails for non-existent path", async () => {
    const result = await validator.validate(makeCtx("/nonexistent/path"));
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("skips when no skill path provided", async () => {
    const result = await validator.validate(makeCtx(undefined));
    expect(result.severity).toBe(Severity.SKIP);
  });
});
