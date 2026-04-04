import { describe, it, expect } from "vitest";
import { join } from "path";
import { SkillContentLengthValidator } from "../../../src/gates/gate6-skills/validators/skill-content-length.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

const FIXTURES = join(process.cwd(), "tests/fixtures/skills");

function makeCtx(skillPath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { skillPath } });
  return new ValidationContext(new NullConnector(), config.server, config);
}

describe("SkillContentLengthValidator", () => {
  const validator = new SkillContentLengthValidator();

  it("validates word count for valid skill", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "valid-skill")));
    // Our fixture has a substantial body — should be pass or warn
    expect([Severity.PASS, Severity.WARN]).toContain(result.severity);
    expect(result.details.wordCount).toBeGreaterThan(0);
  });

  it("warns for very short content", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "invalid-skill")));
    expect(result.severity).toBe(Severity.FAIL); // <100 words
  });
});
