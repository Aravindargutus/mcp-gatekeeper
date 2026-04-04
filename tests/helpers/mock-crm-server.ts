#!/usr/bin/env npx tsx
/**
 * Mock multi-service CRM server simulating Zoho-like tool dependencies.
 *
 * Three services with dependency chains:
 *   Service 1 (CRM):     get_organization → get_modules → get_records → get_record
 *   Service 2 (Projects): get_portal → get_projects → get_tasks → create_task → delete_task → restore_task
 *   Service 3 (Tables):   list_bases → list_tables → list_rows
 *
 * Tests chain discovery, real ID extraction, and write lifecycle.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "mock-crm", version: "1.0.0" });

// In-memory state
const deletedTasks: Set<string> = new Set();
const createdTasks: Map<string, Record<string, unknown>> = new Map();

// ── Service 1: CRM ─────────────────────────────────

server.tool(
  "get_organization",
  "Retrieve the current organization details including portal ID and company information.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      org_id: "ORG_100",
      portal_id: "PORTAL_200",
      company_name: "Test Corp",
      domain: "testcorp.com",
    })}],
  })
);

server.tool(
  "get_modules",
  "List all available CRM modules for the organization. Returns module names and their API identifiers.",
  { portal_id: z.string().describe("Portal ID from get_organization") },
  async ({ portal_id }) => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      data: [
        { api_name: "Leads", module_id: "MOD_301", plural_label: "Leads" },
        { api_name: "Contacts", module_id: "MOD_302", plural_label: "Contacts" },
        { api_name: "Deals", module_id: "MOD_303", plural_label: "Deals" },
      ],
    })}],
  })
);

server.tool(
  "get_records",
  "Fetch records from a specific CRM module. Returns a list of records with their field values.",
  {
    module: z.string().describe("Module API name (e.g., Leads, Contacts)"),
    per_page: z.number().default(10).describe("Records per page"),
  },
  async ({ module }) => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      data: [
        { id: "REC_401", Full_Name: "John Doe", Email: "john@test.com", Module: module },
        { id: "REC_402", Full_Name: "Jane Smith", Email: "jane@test.com", Module: module },
      ],
      info: { count: 2, more_records: false },
    })}],
  })
);

server.tool(
  "get_record",
  "Retrieve a single record by its ID from a CRM module. Returns all field values for the record.",
  {
    module: z.string().describe("Module API name"),
    record_id: z.string().describe("Record ID from get_records"),
  },
  async ({ module, record_id }) => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      data: { id: record_id, Full_Name: "John Doe", Email: "john@test.com", Phone: "+1234567890", Module: module },
    })}],
  })
);

// ── Service 2: Projects ────────────────────────────

server.tool(
  "get_portal",
  "Get portal details for project management. Returns portal ID and configuration.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      portals: [{ id: "PRT_500", name: "Main Portal", default: true }],
    })}],
  })
);

server.tool(
  "get_projects",
  "List all projects in a portal. Returns project IDs, names, and status.",
  { portal_id: z.string().describe("Portal ID from get_portal") },
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      projects: [
        { id: "PRJ_601", name: "Website Redesign", status: "active" },
        { id: "PRJ_602", name: "Mobile App", status: "active" },
      ],
    })}],
  })
);

server.tool(
  "get_tasks",
  "List all tasks in a project. Returns task IDs, titles, and assignees.",
  {
    portal_id: z.string().describe("Portal ID"),
    project_id: z.string().describe("Project ID from get_projects"),
  },
  async () => {
    const tasks = [
      { id: "TSK_701", title: "Design mockups", assignee: "John", status: "open" },
      { id: "TSK_702", title: "Setup CI/CD", assignee: "Jane", status: "completed" },
    ];
    // Include dynamically created tasks
    for (const [id, task] of createdTasks) {
      if (!deletedTasks.has(id)) {
        tasks.push({ id, ...task } as typeof tasks[0]);
      }
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ tasks }) }],
    };
  }
);

server.tool(
  "create_task",
  "Create a new task in a project. Returns the created task ID.",
  {
    portal_id: z.string().describe("Portal ID"),
    project_id: z.string().describe("Project ID"),
    title: z.string().describe("Task title"),
    assignee: z.string().optional().describe("Assignee name"),
  },
  async ({ title, assignee }) => {
    const id = `TSK_${Date.now()}`;
    createdTasks.set(id, { title, assignee: assignee ?? "Unassigned", status: "open" });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ task: { id, title, status: "created" } }) }],
    };
  }
);

server.tool(
  "delete_task",
  "Move a task to trash. Can be restored later with restore_task.",
  {
    portal_id: z.string().describe("Portal ID"),
    project_id: z.string().describe("Project ID"),
    task_id: z.string().describe("Task ID to delete"),
  },
  async ({ task_id }) => {
    deletedTasks.add(task_id);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ status: "trashed", task_id }) }],
    };
  }
);

server.tool(
  "restore_task",
  "Restore a previously deleted task from trash.",
  {
    portal_id: z.string().describe("Portal ID"),
    project_id: z.string().describe("Project ID"),
    task_id: z.string().describe("Task ID to restore"),
  },
  async ({ task_id }) => {
    deletedTasks.delete(task_id);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ status: "restored", task_id }) }],
    };
  }
);

// ── Service 3: Tables ──────────────────────────────

server.tool(
  "list_bases",
  "List all database bases. Returns base IDs and names.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      bases: [
        { id: "BASE_801", name: "Sales Tracker" },
        { id: "BASE_802", name: "Inventory" },
      ],
    })}],
  })
);

server.tool(
  "list_tables",
  "List all tables in a base. Returns table IDs and column definitions.",
  { base_id: z.string().describe("Base ID from list_bases") },
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      tables: [
        { id: "TBL_901", name: "Products", columns: ["Name", "Price", "Stock"] },
        { id: "TBL_902", name: "Orders", columns: ["Customer", "Total", "Date"] },
      ],
    })}],
  })
);

server.tool(
  "list_rows",
  "List all rows in a table. Returns row data with column values.",
  {
    base_id: z.string().describe("Base ID"),
    table_id: z.string().describe("Table ID from list_tables"),
  },
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      rows: [
        { id: "ROW_1001", Name: "Widget", Price: 9.99, Stock: 150 },
        { id: "ROW_1002", Name: "Gadget", Price: 24.99, Stock: 75 },
      ],
    })}],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
