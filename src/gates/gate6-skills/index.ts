import { BaseGate } from "../../core/gate.js";
import { SkillStructureValidator } from "./validators/skill-structure.js";
import { SkillFrontmatterValidator } from "./validators/skill-frontmatter.js";
import { SkillDescriptionQualityValidator } from "./validators/skill-description-quality.js";
import { SkillContentLengthValidator } from "./validators/skill-content-length.js";
import { SkillReferencesValidator } from "./validators/skill-references.js";
import { SkillScriptsValidator } from "./validators/skill-scripts.js";

export class SkillsGate extends BaseGate {
  readonly gateNumber = 6;
  readonly gateName = "Skills Validation";

  constructor() {
    super();
    this.registerValidator(new SkillStructureValidator());
    this.registerValidator(new SkillFrontmatterValidator());
    this.registerValidator(new SkillDescriptionQualityValidator());
    this.registerValidator(new SkillContentLengthValidator());
    this.registerValidator(new SkillReferencesValidator());
    this.registerValidator(new SkillScriptsValidator());
  }
}
