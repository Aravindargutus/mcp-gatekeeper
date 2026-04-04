import { describe, it, expect } from "vitest";
import { BaseGate } from "../../../src/core/gate.js";
import { ValidationContext } from "../../../src/core/context.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { Severity } from "../../../src/core/types.js";
import type { IValidator } from "../../../src/core/interfaces.js";
import type { ValidatorResult } from "../../../src/core/types.js";

function makePassValidator(name: string, deps?: string[]): IValidator {
  return {
    name,
    description: `Test validator ${name}`,
    dependencies: deps,
    async validate(): Promise<ValidatorResult> {
      return { validatorName: name, severity: Severity.PASS, message: "ok", details: {}, durationMs: 0, evidence: [] };
    },
  };
}

function makeFailValidator(name: string): IValidator {
  return {
    name,
    description: `Failing validator ${name}`,
    async validate(): Promise<ValidatorResult> {
      return { validatorName: name, severity: Severity.FAIL, message: "failed", details: {}, durationMs: 0, evidence: ["reason"] };
    },
  };
}

function makeCrashValidator(name: string): IValidator {
  return {
    name,
    description: `Crashing validator ${name}`,
    async validate(): Promise<ValidatorResult> {
      throw new Error("boom");
    },
  };
}

class TestGate extends BaseGate {
  readonly gateNumber = 1; // Use real gate number so config lookups work
  readonly gateName = "Test Gate";
  addValidator(v: IValidator) { this.registerValidator(v); }
}

function makeCtx(overrides?: Record<string, unknown>): ValidationContext {
  const config = PipelineConfigSchema.parse(overrides ?? {});
  return new ValidationContext(new MockConnector(), config.server, config);
}

describe("BaseGate", () => {
  it("runs all validators and aggregates severity", async () => {
    const gate = new TestGate();
    gate.addValidator(makePassValidator("a"));
    gate.addValidator(makePassValidator("b"));
    const result = await gate.execute(makeCtx());
    expect(result.severity).toBe(Severity.PASS);
    expect(result.validatorResults).toHaveLength(2);
  });

  it("captures worst severity", async () => {
    const gate = new TestGate();
    gate.addValidator(makePassValidator("a"));
    gate.addValidator(makeFailValidator("b"));
    const result = await gate.execute(makeCtx());
    expect(result.severity).toBe(Severity.FAIL);
  });

  it("isolates validator crashes as ERROR", async () => {
    const gate = new TestGate();
    gate.addValidator(makeCrashValidator("crasher"));
    const result = await gate.execute(makeCtx());
    expect(result.severity).toBe(Severity.ERROR);
    expect(result.validatorResults[0].message).toContain("boom");
  });

  it("skips disabled validators", async () => {
    const gate = new TestGate();
    gate.addValidator(makeFailValidator("always-fail"));
    const ctx = makeCtx({ gates: { 1: { validators: { "always-fail": { enabled: false } } } } });
    const result = await gate.execute(ctx);
    expect(result.validatorResults[0].severity).toBe(Severity.SKIP);
    expect(result.severity).toBe(Severity.SKIP);
  });

  it("skips validators with unmet dependencies", async () => {
    const gate = new TestGate();
    gate.addValidator(makeFailValidator("prerequisite"));
    gate.addValidator(makePassValidator("dependent", ["prerequisite"]));
    const result = await gate.execute(makeCtx());
    expect(result.validatorResults[1].severity).toBe(Severity.SKIP);
    expect(result.validatorResults[1].message).toContain("requires");
  });

  it("runs dependent validator when prerequisite passes", async () => {
    const gate = new TestGate();
    gate.addValidator(makePassValidator("prerequisite"));
    gate.addValidator(makePassValidator("dependent", ["prerequisite"]));
    const result = await gate.execute(makeCtx());
    expect(result.validatorResults[1].severity).toBe(Severity.PASS);
  });

  it("failOnWarn promotes WARN to FAIL", async () => {
    const warnValidator: IValidator = {
      name: "warner",
      description: "warns",
      async validate(): Promise<ValidatorResult> {
        return { validatorName: "warner", severity: Severity.WARN, message: "warn", details: {}, durationMs: 0, evidence: [] };
      },
    };
    const gate = new TestGate();
    gate.addValidator(warnValidator);
    const ctx = makeCtx({ gates: { 1: { failOnWarn: true } } });
    const result = await gate.execute(ctx);
    expect(result.severity).toBe(Severity.FAIL);
  });
});
