import type { IGate } from "../core/interfaces.js";
import type { PipelineConfig } from "../core/config.js";
import { SchemaGate } from "./gate1-schema/index.js";
import { SecurityGate } from "./gate2-security/index.js";
import { FunctionalGate } from "./gate3-functional/index.js";
import { SkillsGate } from "./gate6-skills/index.js";
import { ExtensionsGate } from "./gate7-extensions/index.js";
import { PackageGate } from "./gate8-package/index.js";
import { SemanticGate } from "./gate4-semantic/index.js";
import { ReviewGate } from "./gate5-review/index.js";

const GATE_REGISTRY: Record<number, () => IGate> = {
  1: () => new SchemaGate(),
  2: () => new SecurityGate(),
  3: () => new FunctionalGate(),
  4: () => new SemanticGate(),
  5: () => new ReviewGate(),
  6: () => new SkillsGate(),
  7: () => new ExtensionsGate(),
  8: () => new PackageGate(),
};

export function createGates(config: PipelineConfig): IGate[] {
  return config.pipeline.enabledGates
    .filter((num) => num in GATE_REGISTRY)
    .sort((a, b) => a - b)
    .map((num) => GATE_REGISTRY[num]());
}
