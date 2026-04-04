# MCPQA — MCP QA Framework

A 5-gated validation pipeline for MCP servers, Claude Code skills, and Claude Desktop extensions.

**34 validators** across 5 gates catch schema violations, security vulnerabilities, functional bugs, skill format issues, and extension problems — before you ship.

## Quick Start

```bash
# Validate an MCP server
npx mcpqa run --server-url https://your-server.com/mcp

# Validate a Claude Code skill
npx mcpqa run --skill-path ./.claude/skills/my-skill --gates 6

# Validate an extension
npx mcpqa run --extension-path ./my-extension --gates 7
```

## Use as an MCP Server

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mcpqa": {
      "command": "npx",
      "args": ["-y", "mcpqa-server"]
    }
  }
}
```

Then ask Claude: *"Validate the MCP server at https://example.com/mcp"*

## Gates

| Gate | What It Validates | Validators |
|------|------------------|------------|
| **1. Schema** | MCP protocol conformance, tool names, JSON Schema, descriptions | 6 |
| **2. Security** | Prompt injection, SSRF, secrets, permissions, dynamic injection | 9 |
| **3. Functional** | Handshake, invocation, boundary testing, timeouts, idempotency | 9 |
| **6. Skills** | SKILL.md structure, frontmatter, description quality, scripts | 6 |
| **7. Extensions** | Manifest, permissions, bundled MCP configs, security scanning | 4 |

## CLI Options

```bash
mcpqa run [options]

Options:
  --server-cmd <cmd>       MCP server command (stdio)
  --server-url <url>       MCP server URL (http/sse)
  --transport <type>       stdio | sse | http
  --skill-path <path>      Claude Code skill directory
  --extension-path <path>  Extension directory
  --gates <nums>           Gate numbers: 1,2,3,6,7
  --mode <mode>            strict (stop on fail) | lenient (run all)
  --config <path>          YAML config file
  --output-dir <dir>       Report output (default: ./reports)
```

## Reports

Every run generates:
- **Console** — colored real-time output
- **JSON** — machine-readable at `reports/latest.json`
- **HTML** — styled dark-theme report at `reports/latest.html`

## Development

```bash
npm install
npm test          # 122 tests
npm run lint      # type-check
npm run build     # compile to dist/
```

## License

MIT
