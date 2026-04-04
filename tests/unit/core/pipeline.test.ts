import { describe, it, expect } from "vitest";
import { PipelineOrchestrator } from "../../../src/core/pipeline.js";
import { PipelineConfigSchema } from "../../../src/core/config.js";
import { MockConnector } from "../../../src/connectors/mock.connector.js";
import { SchemaGate } from "../../../src/gates/gate1-schema/index.js";
import { Severity } from "../../../src/core/types.js";
import type { IReporter } from "../../../src/core/interfaces.js";
import type { ToolDefinition } from "../../../src/core/types.js";

const validTool: ToolDefinition = {
  name: "get_user",
  description: "Retrieve a user by their unique identifier. Returns the user profile.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "User ID", maxLength: 64 },
    },
    required: ["user_id"],
  },
  raw: {
    name: "get_user",
    description: "Retrieve a user by their unique identifier. Returns the user profile.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "User ID", maxLength: 64 },
      },
      required: ["user_id"],
    },
  },
};

const noopReporter: IReporter = {
  onGateStart: () => {},
  onGateComplete: () => {},
  onValidatorComplete: () => {},
  finalize: async () => {},
};

describe("PipelineOrchestrator", () => {
  it("runs pipeline with mock connector and returns report", async () => {
    const config = PipelineConfigSchema.parse({
      pipeline: { enabledGates: [1] },
      server: { transport: "mock" },
    });

    const pipeline = new PipelineOrchestrator(
      config,
      [new SchemaGate()],
      [noopReporter],
      () => new MockConnector({ tools: [validTool] })
    );

    const report = await pipeline.run();
    expect(report.pipelineId).toBeTruthy();
    expect(report.gateResults.length).toBe(1);
    expect(report.gateResults[0].gateName).toBe("Schema Validation");
    expect(report.completedAt).toBeTruthy();
  });

  it("returns exit code 0 for passing pipeline", async () => {
    const config = PipelineConfigSchema.parse({
      pipeline: { enabledGates: [1] },
      server: { transport: "mock" },
    });

    const pipeline = new PipelineOrchestrator(
      config,
      [new SchemaGate()],
      [noopReporter],
      () => new MockConnector({ tools: [validTool] })
    );

    const report = await pipeline.run();
    expect(pipeline.getExitCode(report)).toBe(0);
  });

  it("handles connection failure gracefully", async () => {
    const config = PipelineConfigSchema.parse({
      pipeline: { enabledGates: [1] },
      server: { transport: "mock" },
    });

    const pipeline = new PipelineOrchestrator(
      config,
      [new SchemaGate()],
      [noopReporter],
      () => new MockConnector({ shouldFailConnect: true })
    );

    const report = await pipeline.run();
    expect(report.overallSeverity).toBe(Severity.ERROR);
    expect(pipeline.getExitCode(report)).toBe(1);
  });
});
