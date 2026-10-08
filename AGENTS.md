# AGENTS.md

Entry point for coding agents. Humans should start at [README.md](README.md) and
[CONTRIBUTING.md](CONTRIBUTING.md); everything here is also true for them, and CONTRIBUTING has the
detail this page points to.

## What this is

PDX UI: a signal-based UI framework whose compiler turns `.pdx` files into standard Web Components.
A TypeScript monorepo of pnpm workspaces. The published packages are `@pdxui/core`, `compiler`,
`router`, `ui`, `design`, `cli`, `lsp` and `framework`; `responsive` (the certification harness),
`showcase`, `site` and `builder` are not published. The table of packages is in CONTRIBUTING.

The compiler is the product: when a developer has to write the same wiring twice, the framework
has a bug, and the fix is a declaration the compiler turns into that wiring.

## Build and test

```bash
pnpm install                    # also points git at .githooks/
pnpm build                      # once on a fresh clone: framework typechecks against its siblings' dist/
pnpm test                       # every package: the vitest suites, then the browser suites one at a time
pnpm typecheck
pnpm lint                       # 0 errors; the warning count is a ratchet and must not rise
pnpm certify                    # a component change: contract geometry, axe, hostile CSS, keyboard, 13 themes
pnpm certify:visual             # an appearance change: visual regression in Docker
```

While you work, run what you touch: `pnpm --filter @pdxui/core exec vitest run tests/signal.test.ts`.
The `pre-push` hook runs the whole gate, certification included; do not bypass it.

## The things most likely to be got wrong

1. **A component that is not exported is not registered, and nothing says so.** A `<pdx-*>` tag is
   auto-imported through the `exports` of `packages/ui/package.json`, which are generated: after
   adding a component run `pnpm --dir packages/ui run manifest` and then `run exports`, add its
   import to `packages/ui/src/index.ts` by hand, and restart Vite with `--force`.
2. **A `ctx.track()` that returns before it reads a signal never runs again.** Read the signals
   first, then touch the DOM in a frame.
3. **Bind attributes with `:attr=`, never `${}`.** The compiler warns with `PDX_RAW_INTERPOLATION`.
4. **A fill colour is never a text colour.** Text in a semantic colour takes
   `--pdx-color-{name}-ink`; the tint behind it, `-soft`.
5. **Dev and a production build must render the same.** Dev interprets templates, a build compiles
   them; a difference between the two is a compiler bug, and a test that runs only one of them does
   not show it.

## Where things live

| | |
|---|---|
| Architecture | [docs/architecture](docs/architecture): `framework.md`, then `core.md` and `compiler.md` |
| Component design rules (the compiler's design checks cite them) | [docs/PDX-COMPONENT-DESIGN.md](docs/PDX-COMPONENT-DESIGN.md) |
| User documentation, published as the site | `packages/site/content/docs/` |
| A component | `packages/ui/src/{name}/pdx-{name}.ts` |
| Its demo page, and one component per demo section | `packages/compiler/demo/showcase-new/pages/comp-{name}.pdx`, `pages/sections/comp-{name}/` |
| Its certification manifest | `packages/responsive/tests/manifests/{name}.manifest.ts` |
| Themes and tokens, for designers | [packages/design/THEMING.md](packages/design/THEMING.md) |
| Agent skills for building with PDX | `marketplace/plugins/pdxui/` |

## Files you do not edit by hand

These are generated. Change the source and run the command; the gate fails when a copy drifts.

| Generated | Source | Command |
|---|---|---|
| `packages/ui/custom-elements.json` | the components' `component()` declarations | `pnpm --dir packages/ui run manifest` |
| the `exports` of `packages/ui/package.json` | the component folders | `pnpm --dir packages/ui run exports` |
| `packages/ui/tests/scenarios/generated/`, `…/contracts/generated/` | the certification manifests | `pnpm certify:gen` |
| the skill catalogue under `marketplace/plugins/pdxui/skills/` | `custom-elements.json`, the site's summaries, the sources' events | `node marketplace/plugins/pdxui/skills/pdxui/tools/gen-catalog.mjs` and `gen-topics.mjs` |
| `packages/site/content/docs/api.md` and the skill's `api.md` | core's public surface | `node packages/site/scripts/gen-api.mjs` |

A snapshot (`__snapshots__/*.snap`) is updated with `vitest -u` only after reading every line of its
diff. A change under `marketplace/` raises the plugin's `version` in `.claude-plugin/marketplace.json`
and `plugins/pdxui/.claude-plugin/plugin.json` together: an installed copy updates only when it moves.

## How a change gets accepted

Agent-written contributions are welcome. What follows is the bar a change is held to.

**Know what done means before you start.** Name the thing that will show the change worked: a test,
an exit code, a measurement in the browser. If no such thing exists, building it comes first.

**Verified means you ran it.** Show the command and its output. The absence of an error is not
evidence of success: check that the step did what it was for.

**Check instead of assuming.** If confirming something costs one command — a path, an option, a
signature, what a document says — run it. One occurrence is a hypothesis; look at a second before
treating it as the convention.

**A bug becomes a test first.** Write the test that reproduces it and see it fail, then fix it. A
test that passes the first time proves nothing yet: take the fix out, and it must fail. Geometry,
focus and layout are measured in a browser, not in happy-dom.

**Know what was red before you came.** When a suite fails, check whether it failed without your
change before investigating it.

**Fix the cause.** If the correct fix is larger than the change you set out to make, say so; do not
ship the workaround as the repair.

**Never invent** an API, an option, a file's contents, a command's output or a test result.

**Say what you left out.** A change that covers part of what was asked is fine when the rest is
stated.

**These need an explicit reason in the pull request**, because each makes a red signal green without
fixing anything: an empty `catch`; a cast to `any` to satisfy the compiler; a disabled test or a
weakened assertion; an `eslint-disable`; `--no-verify`; a sleep standing in for real
synchronisation.

**Do not bring in a new dependency** without raising it first, and keep the change to what was
asked: no reformatting, no import reordering, no renames in code you were not sent to touch.

**If three attempts at the same problem fail, stop**, and report what you tried, what you observed
and what you would need.
