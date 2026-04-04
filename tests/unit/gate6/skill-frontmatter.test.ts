import { describe, it, expect } from "vitest";
import { join } from "path";
import { SkillFrontmatterValidator } from "../../../src/gates/gate6-skills/validators/skill-frontmatter.js";
import { NullConnector } from "../../../src/connectors/null.connector.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { Severity } from "../../../src/core/types.js";

const FIXTURES = join(process.cwd(), "tests/fixtures/skills");

function makeCtx(skillPath?: string): ValidationContext {
  const config = PipelineConfigSchema.parse({ server: { skillPath } });
  return new ValidationContext(new NullConnector(), config.server, config);
}

describe("SkillFrontmatterValidator", () => {
  const validator = new SkillFrontmatterValidator();

  it("passes for valid frontmatter", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "valid-skill")));
    expect(result.severity).toBe(Severity.PASS);
    expect(result.details.name).toBe("Code Review Helper");
  });

  it("fails for missing frontmatter", async () => {
    const result = await validator.validate(makeCtx(join(FIXTURES, "invalid-skill")));
    expect(result.severity).toBe(Severity.FAIL);
    expect(result.message).toContain("no YAML frontmatter");
  });

  it("skips when no skill path", async () => {
    const result = await validator.validate(makeCtx(undefined));
    expect(result.severity).toBe(Severity.SKIP);
  });
});
