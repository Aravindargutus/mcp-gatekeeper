import { describe, it, expect } from "vitest";
import { NullConnector } from "../../../src/connectors/null.connector.js";

describe("NullConnector", () => {
  it("connects successfully", async () => {
    const connector = new NullConnector();
    const result = await connector.connect();
    expect(connector.isConnected).toBe(true);
    expect(result.serverInfo.name).toBe("null");
    expect(result.protocolVersion).toBe("2025-11-25");
  });

  it("returns empty tools", async () => {
    const connector = new NullConnector();
    await connector.connect();
    const tools = await connector.listTools();
    expect(tools).toEqual([]);
  });

  it("returns error for callTool", async () => {
    const connector = new NullConnector();
    await connector.connect();
    const result = await connector.callTool("any_tool", {});
    expect(result.isError).toBe(true);
  });

  it("disconnects cleanly", async () => {
    const connector = new NullConnector();
    await connector.connect();
    await connector.disconnect();
    expect(connector.isConnected).toBe(false);
  });
});
