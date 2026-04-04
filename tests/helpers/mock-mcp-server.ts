#!/usr/bin/env npx tsx
/**
 * Minimal MCP server for testing the QA framework locally.
 * Run: npx tsx tests/helpers/mock-mcp-server.ts
 * Then: npx tsx src/cli.ts run --server-cmd "npx" --server-args "tsx,tests/helpers/mock-mcp-server.ts"
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "test-qa-server",
  version: "1.0.0",
});

// A well-defined tool (should pass all gates)
server.tool(
  "get_greeting",
  "Generate a personalized greeting message for a user by their name. Returns the greeting as plain text.",
  {
    name: z.string().max(100).describe("The name of the person to greet"),
    style: z.enum(["formal", "casual"]).optional().describe("Greeting style: formal or casual"),
  },
  async ({ name, style }) => {
    const greeting = style === "formal"
      ? `Good day, ${name}. How may I assist you?`
      : `Hey ${name}! What's up?`;
    return { content: [{ type: "text" as const, text: greeting }] };
  }
);

// A tool with multiple params (tests parameter handling)
server.tool(
  "search_items",
  "Search for items in the inventory by query string. Supports pagination via offset and limit parameters.",
  {
    query: z.string().max(512).describe("Search query text"),
    limit: z.number().min(1).max(100).default(20).describe("Maximum number of results to return"),
    offset: z.number().min(0).default(0).describe("Number of results to skip for pagination"),
  },
  async ({ query, limit, offset }) => {
    const items = Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      id: offset + i + 1,
      name: `${query} item ${offset + i + 1}`,
    }));
    return {
      content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
    };
  }
);

// A read-only tool (tests idempotency)
server.tool(
  "get_server_time",
  "Retrieve the current server timestamp in ISO 8601 format. Useful for checking server availability.",
  {},
  async () => {
    return {
      content: [{ type: "text" as const, text: new Date().toISOString() }],
    };
  }
);

// A tool that validates input (tests boundary handling)
server.tool(
  "calculate_sum",
  "Calculate the sum of two numbers. Returns the result as a text response.",
  {
    a: z.number().describe("First number to add"),
    b: z.number().describe("Second number to add"),
  },
  async ({ a, b }) => {
    return {
      content: [{ type: "text" as const, text: String(a + b) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
