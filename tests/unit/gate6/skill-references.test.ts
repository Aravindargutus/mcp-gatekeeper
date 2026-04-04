import { describe, it, expect } from "vitest";
import { join } from "path";
import { SkillReferencesValidator } from "../../../src/gates/gate6-skills/validators/skill-references.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

const FIXTURES = join(process.cwd(), "tests/fixtures/skills");

function makeCtx(skillPath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { skillPath } });
  return new ValidationContext(new NullConnector(), config.server, config);
}

describe("SkillReferencesValidator", () => {
  const validator = new SkillReferencesValidator();

  it("passes when references/ is linked from SKILL.md", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "valid-skill")));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("passes when no references/ directory", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "invalid-skill")));
    expect(result.severity).toBe(Severity.PASS);
  });

  it("skips when no skill path", async () => {
    const result = await validator.validate(makeCtx(undefined));
    expect(result.severity).toBe(Severity.SKIP);
  });
});
