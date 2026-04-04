import { describe, it, expect } from "vitest";
import { PipelineConfigSchema, mergeConfigWithCLI } from "../../../src/core/config.js";

describe("PipelineConfigSchema", () => {
  it("parses empty object with defaults", () => {
    const config = PipelineConfigSchema.parse({});
    expect(config.pipeline.mode).toBe("strict");
    expect(config.pipeline.enabledGates).toEqual([1, 2, 3]);
    expect(config.server.transport).toBe("stdio");
    expect(config.server.connectTimeout).toBe(30_000);
    expect(config.pipeline.gateTimeoutSeconds).toBe(300);
  });

  it("accepts http transport", () => {
    const config = PipelineConfigSchema.parse({
      server: { transport: "http", url: "http://localhost:3000/mcp" },
    });
    expect(config.server.transport).toBe("http");
    expect(config.server.url).toBe("http://localhost:3000/mcp");
  });

  it("accepts headers config", () => {
    const config = PipelineConfigSchema.parse({
      server: { transport: "http", url: "http://localhost:3000", headers: { Authorization: "Bearer xxx" } },
    });
    expect(config.server.headers).toEqual({ Authorization: "Bearer xxx" });
  });

  it("rejects invalid transport", () => {
    expect(() => PipelineConfigSchema.parse({ server: { transport: "websocket" } })).toThrow();
  });

  it("accepts failOnWarn per gate", () => {
    const config = PipelineConfigSchema.parse({
      gates: { 1: { failOnWarn: true } },
    });
    expect(config.gates[1].failOnWarn).toBe(true);
  });
});

describe("mergeConfigWithCLI", () => {
  it("overrides gates", () => {
    const base = PipelineConfigSchema.parse({});
    const merged = mergeConfigWithCLI(base, { gates: [1] });
    expect(merged.pipeline.enabledGates).toEqual([1]);
  });

  it("defaults to http transport when --server-url is given", () => {
    const base = PipelineConfigSchema.parse({});
    const merged = mergeConfigWithCLI(base, { serverUrl: "http://localhost:3000" });
    expect(merged.server.transport).toBe("http");
    expect(merged.server.url).toBe("http://localhost:3000");
  });

  it("explicit transport overrides default", () => {
    const base = PipelineConfigSchema.parse({});
    const merged = mergeConfigWithCLI(base, {
      serverUrl: "http://localhost:3000",
      transport: "sse",
    });
    expect(merged.server.transport).toBe("sse");
  });

  it("merges headers", () => {
    const base = PipelineConfigSchema.parse({});
    const merged = mergeConfigWithCLI(base, {
      headers: { "X-Token": "abc" },
    });
    expect(merged.server.headers).toEqual({ "X-Token": "abc" });
  });
});
