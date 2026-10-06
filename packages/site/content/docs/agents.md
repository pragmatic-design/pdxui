---
title: Using PDX with an AI agent
description: "The skills, the docs for a model, AGENTS.md, the check loop and the MCP server — what an agent needs to write PDX that compiles."
order: 4.5
---

# Using PDX with an AI agent

An agent writes PDX well when it reads PDX's own sources instead of its training data, and when it
checks its work with the compiler instead of by eye. Everything below exists for that.

## The skills

The `pdxui` plugin is the agent's manual: the `.pdx` language, every component one page each, screen
recipes, theming, the data layer, routing, testing, and the traps measured while building real apps.

```bash
# Claude Code
claude plugin marketplace add pragmatic-design/skills
claude plugin install pdxui@pragmatic-design

# Codex
codex plugin marketplace add pragmatic-design/skills
codex plugin add pdxui@pragmatic-design
```

Any agent that reads the Agent Skills format can load the folders under `plugins/pdxui/skills/`
directly.

## The docs, for a model

- [`/llms.txt`](/llms.txt) — an index: every docs page and every component, one line each.
- [`/llms-full.txt`](/llms-full.txt) — everything: the docs pages and every component's API.

## AGENTS.md

`pdx new project` writes an `AGENTS.md` in the project — the file Claude Code, Codex, Cursor and
others read when they open a folder. It says what PDX is, the loop below, where the truth is, and
the rules most often broken (the same rules the `pdxui` skill lists; a test keeps the two equal). In
a project that predates it, copy it from a fresh `pdx new project`.

## The loop

The compiler is the check, and it speaks JSON:

```bash
npm i -D @pdxui/cli             # once per app: the CLI is a dev dependency
npx pdx check --json            # findings: code, file:line:column, hint, and a fix as text edits
npx pdx check --fix             # apply the fixes, then report what is left
npx pdx check --types           # the TypeScript check of scripts and templates
npx pdx explain PDX_RAW_INTERPOLATION --json   # what a code means and what to write instead
npx pdx analyze --json          # the project manifest: components, their API, the routes
```

Write, check, apply the fixes, check again — a fix can uncover what the finding hid — and then run
the app and measure what changed. Every flag is on the [CLI](/docs/cli) page.

## The MCP server

For an agent that speaks MCP, `pdx mcp` serves the same answers as tools — `check`, `explain`,
`component`, `components`, `project` and `docs` — so it calls them instead of parsing text. Run it
from the project folder:

```bash
claude mcp add pdx -- npx pdx mcp      # Claude Code
codex mcp add pdx -- npx pdx mcp       # Codex
```

In Cursor, `.cursor/mcp.json` in the project:

```json
{
  "mcpServers": {
    "pdx": { "command": "npx", "args": ["pdx", "mcp"] }
  }
}
```

## The running app

In development the app answers too: `window.__PDX_DEVTOOLS__` is a versioned API whose every answer
is JSON — the component tree, one component's props and state, the last errors, the route.

```bash
agent-browser eval "JSON.stringify(__PDX_DEVTOOLS__.inspect('pdx-login'))"
```

The whole API is on the [DevTools](/docs/devtools) page.
