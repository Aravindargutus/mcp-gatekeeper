import { describe, it, expect } from "vitest";
import { Severity, worstSeverity, isBlocking } from "../../../src/core/types.js";

describe("worstSeverity", () => {
  it("returns PASS for empty array", () => {
    expect(worstSeverity([])).toBe(Severity.PASS);
  });

  it("returns PASS when all are PASS", () => {
    expect(worstSeverity([Severity.PASS, Severity.PASS])).toBe(Severity.PASS);
  });

  it("filters out SKIP — returns PASS if only PASS + SKIP", () => {
    expect(worstSeverity([Severity.PASS, Severity.SKIP, Severity.PASS])).toBe(Severity.PASS);
  });

  it("returns SKIP when all are SKIP (no active results)", () => {
    expect(worstSeverity([Severity.SKIP, Severity.SKIP])).toBe(Severity.SKIP);
  });

  it("WARN beats PASS", () => {
    expect(worstSeverity([Severity.PASS, Severity.WARN])).toBe(Severity.WARN);
  });

  it("FAIL beats WARN", () => {
    expect(worstSeverity([Severity.WARN, Severity.FAIL])).toBe(Severity.FAIL);
  });

  it("ERROR beats FAIL", () => {
    expect(worstSeverity([Severity.FAIL, Severity.ERROR])).toBe(Severity.ERROR);
  });

  it("SKIP does not degrade PASS to SKIP", () => {
    expect(worstSeverity([Severity.PASS, Severity.SKIP])).toBe(Severity.PASS);
  });
});

describe("isBlocking", () => {
  it("FAIL is blocking", () => {
    expect(isBlocking(Severity.FAIL)).toBe(true);
  });

  it("ERROR is blocking", () => {
    expect(isBlocking(Severity.ERROR)).toBe(true);
  });

  it("PASS is not blocking", () => {
    expect(isBlocking(Severity.PASS)).toBe(false);
  });

  it("WARN is not blocking", () => {
    expect(isBlocking(Severity.WARN)).toBe(false);
  });

  it("SKIP is not blocking", () => {
    expect(isBlocking(Severity.SKIP)).toBe(false);
  });
});
