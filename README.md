<p align="center">
  <h1 align="center">MCP Gatekeeper</h1>
  <p align="center">
    <strong>The QA framework for the MCP ecosystem</strong>
    <br />
    46 validators &middot; 8 gates &middot; Schema &middot; Security &middot; Functional &middot; AI Eval &middot; Human Review
  </p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#what-it-catches">What It Catches</a> &middot;
  <a href="#gates">Gates</a> &middot;
  <a href="#ai-evaluation">AI Evaluation</a> &middot;
  <a href="#use-as-mcp-server">Use as MCP Server</a>
</p>

---

**MCP has 200+ server implementations but zero quality gates before publishing.** MCP Gatekeeper fills that gap.

Run it before you publish to the MCP Registry, npm, or Smithery. It catches schema violations, security vulnerabilities, functional bugs, and quality issues that other tools miss — including an LLM-powered semantic evaluation that compares what your tools *claim* to do against what they *actually* do.

```bash
npx mcpqa run --server-url https://your-mcp-server.com/mcp
```

## What It Catches

Real findings from running against a production Zoho MCP server (65 tools):

| Finding | Gate | What It Means |
|---|---|---|
| 125 tools accept invalid inputs silently | Functional | Server returns `isError: false` for empty/wrong-type args |
| 107 parameters have no description | Schema | LLMs can't use tools with undocumented params |
| 26 write tools lack rate limit info | Security | Consumers don't know if there's a throttle |
| SQL injection payloads reflected in output | Security | Dynamic injection testing caught real vulnerability |
| Tool descriptions don't match actual behavior | AI Eval | Claude compared descriptions vs invocation results |

## Quick Start

```bash
# Validate an MCP server (Gates 1-3: schema + security + functional)
npx mcpqa run --server-url https://your-server.com/mcp

# Add AI semantic evaluation (Gate 4 — requires Anthropic API key)
ANTHROPIC_API_KEY=... npx mcpqa run --server-url https://your-server.com/mcp --gates 1,2,3,4

# Validate a Claude Code skill
npx mcpqa run --skill-path ./.claude/skills/my-skill --gates 6

# Validate an extension
npx mcpqa run --extension-path ./my-extension --gates 7

# Validate your npm package before publishing
npx mcpqa run --package-path . --gates 8

# Everything at once
npx mcpqa run --server-url https://server.com/mcp --package-path . --gates 1,2,3,4,8 --mode lenient
```

## Gates

| Gate | What It Validates | Validators | Speed |
|------|------------------|------------|-------|
| **1. Schema** | Protocol conformance, tool names, JSON Schema, descriptions, parameter types | 6 | < 1s |
| **2. Security** | Prompt injection, SSRF, secrets, permissions, dangerous patterns, dynamic injection with real payloads | 9 | 2-10s |
| **3. Functional** | Handshake, invocation, boundary testing, error format, timeouts, idempotency | 9 | 2-5min |
| **4. AI Semantic** | Description accuracy vs behavior, param clarity, response completeness, integration readiness, tool chains | 7 | 2-5min |
| **5. Human Review** | Dashboard with approve/reject/escalate, auto-approve for high scores, audit trail | 1 | On-demand |
| **6. Skills** | SKILL.md structure, frontmatter, description quality, content length, references, scripts | 6 | < 1s |
| **7. Extensions** | Manifest, permissions, bundled MCP configs, security scanning | 4 | < 1s |
| **8. Package** | package.json, server.json, LICENSE, dependency audit, secrets in source | 5 | < 1s |

## AI Evaluation

Gate 4 uses an LLM-as-judge (Claude or OpenAI-compatible) to evaluate things code can't:

- **Description accuracy**: Does the description match what the tool *actually does*? (compares against Gate 3 invocation results)
- **Parameter clarity**: Could a developer use this tool correctly on the first try?
- **Integration readiness**: Can someone build an integration from metadata alone?
- **Tool chain analysis**: Do the tools form coherent workflows, or are there gaps?

Applies patterns from [Anthropic's harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) and [eval framework](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents):
- **Skeptical evaluator** — system prompt forces adversarial QA, not praise
- **pass@k / pass^k** — multi-trial evaluation for reliability metrics
- **Actionable fixes** — every finding includes specific developer guidance
- **Transcript recording** — full LLM conversations saved for debugging

## Use as MCP Server

MCP Gatekeeper is itself an MCP server. Add it to Claude Desktop:

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

**6 tools exposed:** `validate_mcp_server`, `validate_skill`, `validate_extension`, `validate_package`, `get_report`, `list_validators`

## CLI Reference

```bash
mcpqa run [options]          # Run validation pipeline
mcpqa validate-config <path> # Validate YAML config
mcpqa diff <before> <after>  # Compare two reports
mcpqa dashboard [--port N]   # Launch human review UI

Options:
  --server-url <url>         MCP server URL (http/sse)
  --server-cmd <cmd>         MCP server command (stdio)
  --skill-path <path>        Claude Code skill directory
  --extension-path <path>    Extension directory
  --package-path <path>      npm package directory
  --gates <nums>             Gate numbers (e.g., 1,2,3,4,6,7,8)
  --mode <strict|lenient>    Stop on first fail vs run all
  --trials <number>          LLM evaluation trials for pass@k
  --save-baseline            Save results for regression tracking
  --check-regression         Compare against saved baseline
  --verbose / --debug        Control log verbosity
  --dry-run                  Show what would run without executing
```

## Reports

| Format | File | Use Case |
|--------|------|----------|
| Console | stdout | Real-time progress with colored badges and progress bars |
| JSON | `reports/latest.json` | CI/CD integration, programmatic access |
| HTML | `reports/latest.html` | Dark-themed visual report for stakeholders |
| SARIF | `reports/latest.sarif` | GitHub Code Scanning, VS Code SARIF Viewer |
| Transcripts | `reports/transcripts/` | Gate 4 LLM conversation debugging |

## CI/CD Integration

```yaml
# GitHub Actions
- name: Validate MCP Server
  run: npx mcpqa run --server-cmd "node dist/server.js" --gates 1,2,3,8
  # Exit code 0 = pass, 1 = fail
```

```bash
# Docker
docker build -t mcpqa .
docker run mcpqa run --server-url https://server.com/mcp
```

## Configuration

```yaml
# configs/default.yaml
pipeline:
  mode: strict
  enabledGates: [1, 2, 3]

server:
  transport: http
  url: https://your-server.com/mcp
  headers:
    Authorization: "Bearer your-token"

semantic:
  trials: 3                    # pass@k evaluation
  autoApproveThreshold: 4.5   # Gate 5 auto-approve

reporting:
  formats: [console, json, sarif]
  outputDir: ./reports
```

## Development

```bash
npm install
npm test              # 172 tests
npm run lint          # type-check
npm run build         # compile to dist/
```

## Architecture

```
CLI (mcpqa) ─┐                    ┌─ MCP Server (mcpqa-server)
              │                    │
              ▼                    ▼
         PipelineOrchestrator (shared core)
              │
    ┌─────────┼──────────┬──────────┐
    ▼         ▼          ▼          ▼
 Gate 1-3  Gate 4     Gate 5     Gate 6-8
 Code      LLM Judge  Dashboard  File
 (24 val)  (7 val)    (htmx)    (15 val)
```

## Contributing

PRs welcome. Each validator is a single file implementing `IValidator`. To add a new check:

1. Create `src/gates/gateN-name/validators/your-check.ts`
2. Implement `IValidator` interface (name, description, validate)
3. Register in the gate's `index.ts`
4. Add tests in `tests/unit/gateN/`

## License

MIT

## Links

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [Official MCP Registry](https://registry.modelcontextprotocol.io/)
- [Anthropic Harness Design](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Anthropic Eval Framework](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
