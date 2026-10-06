---
name: pdxui-setup
description: "PDX (@pdxui) project setup and build: installing, the Vite plugin, the pdx CLI (dev, build, check, new, analyze, theme, i18n), dev interpreted vs production compiled, first-screen preloading, CDN and framework interop, devtools. Use when starting, building or shipping a .pdx app."
---

# PDX · Setup, build and tooling

How a project is installed, run and built. How its files are written is `pdxui-language`.

## Decide

| You want… | Do | Read |
| --- | --- | --- |
| a project | `pnpm add @pdxui/core @pdxui/compiler`, `pdx()` in the Vite config | [getting-started](references/getting-started.md) § Installation |
| the CLI | `npm i -D @pdxui/cli`, then `npx pdx …` | [cli](references/cli.md) § The commands |
| the daily loop | `npx pdx dev`: interpreted, HMR, no build | [cli](references/cli.md) § pdx dev |
| the production build | `npx pdx build` | [cli](references/cli.md) § pdx build · [compiler](references/compiler.md) § Dual mode |
| a CI gate | `npx pdx check`: the defects, no build | [cli](references/cli.md) § pdx check |
| a design review | `npx pdx check --design`: adds the heuristics and cross-file rules (`category: "design"`) | [cli](references/cli.md) § pdx check |
| what a `PDX_*` code means | `npx pdx explain <CODE>` (`--json` for an agent) | [diagnostics](references/diagnostics.md) |
| the fixes applied, then what is left | `npx pdx check --json --fix` | [cli](references/cli.md) § pdx check |
| a finding that is intended where it is | `pdx-ignore <CODE>: <reason>` in a comment on the line before; never without the reason | [cli](references/cli.md) § When a finding is intended |
| the landing route's JavaScript in one wave | `pdx({ preloadRoutes: ['/dashboard'] })` (`['/']` by default) | [compiler](references/compiler.md) § The first screen |
| PDX without a build, or inside React/Vue/Angular | a script tag, prebuilt components | [integration](references/integration.md) |
| to see the component tree and signals | the devtools overlay, `__PDX_DEVTOOLS__.debug` | [devtools](references/devtools.md) |
| an AI agent working in the project | the skills plugin, `AGENTS.md` from `pdx new project`, `npx pdx mcp` | [agents](references/agents.md) |

## Traps

- **The CLI is its own dev dependency.** `@pdxui/framework` does not include it; without the install,
  `npx pdx` asks the registry for a package called `pdx` and gets a 404. ([cli](references/cli.md) § The commands)
- **Dev and production run different code paths**: bindings are inlined in a production build. If a
  bug shows only there, `pdx({ inlineBindings: false })` switches back to the template path.
  ([compiler](references/compiler.md) § Turning the inline path off)
- **Devtools are dev only.** A signal with 0 subscribers that should drive the UI was usually
  snapshotted (`const v = sig()`) instead of read in the template. ([devtools](references/devtools.md) § Gotchas)

## References

Copies of the site's docs pages, regenerated with them: [getting-started](references/getting-started.md) ·
[cli](references/cli.md) · [agents](references/agents.md) · [compiler](references/compiler.md) · [diagnostics](references/diagnostics.md) ·
[integration](references/integration.md) · [devtools](references/devtools.md).
