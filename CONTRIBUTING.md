# Contributing to PDX UI

Thank you for looking. This is an **alpha**: APIs still change between releases, and the
[CHANGELOG](CHANGELOG.md) records every change an application can notice. Please read this page
before opening a pull request. It is short, and each rule on it exists because something broke
without it.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Please report
vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes, not in an issue. A question
belongs in Discussions: [SUPPORT.md](SUPPORT.md) says where each kind of request goes.

## Setup

- **Node 22** (the version CI runs) and **pnpm 10** (`packageManager` in `package.json` pins it).
- `pnpm install` at the root. The install also points git at `.githooks/`, whose `pre-push` hook
  runs the gate described below.
- `pnpm build` once after the install, and again after changing a package another one depends on:
  `@pdxui/framework` typechecks against what core, ui and router publish (`dist/`), so on a fresh
  clone `pnpm typecheck` — and the pre-push — fail until they are built.
- Browser suites need Chromium: `pnpm --filter @pdxui/design exec playwright install chromium`.
- `pnpm certify:visual` needs Docker. It is skipped automatically when the daemon does not answer.

## The repository

| Package | What it is |
|---------|-----------|
| `packages/core` | The runtime: signals, the template engine, components, forms, data, i18n |
| `packages/compiler` | The Vite plugin: `.pdx` → JavaScript + `.d.ts` |
| `packages/router` | `@page` routing, the outlet, guards |
| `packages/ui` | The component library (`<pdx-*>` custom elements) |
| `packages/design` | The CSS design system: tokens, 13 themes, the theme engine |
| `packages/cli` | The `pdx` command: `build`, `dev`, `check`, `new`, `analyze`, `theme`, … |
| `packages/lsp`, `packages/vscode-pdx` | The language server and the VS Code extension |
| `packages/framework` | The runtime in one install |
| `packages/responsive` | The component certification harness (not published) |
| `packages/showcase`, `packages/site`, `packages/builder` | The demo app, the documentation site, the theme builder (not published) |

The architecture is in [docs/architecture](docs/architecture): start from
[framework.md](docs/architecture/framework.md), then [core.md](docs/architecture/core.md) and
[compiler.md](docs/architecture/compiler.md).

## Rules

1. **If a developer has to write boilerplate, the framework has a bug.** A pattern that repeats
   becomes a declaration (`@prop`, `@page`, `@fetch`, …) whose wiring the compiler generates.
2. **The compiler is the product.** The value is in the transformation from declaration to code,
   not in the runtime API.
3. **Every feature must be something an agent can generate correctly on the first try.** If it
   cannot, the developer experience is broken.
4. **No reflection, no hidden magic.** Everything can be traced from the `.pdx` to the generated
   JavaScript.
5. **Progressive complexity.** A simple component is five lines. An enterprise component follows
   the same pattern, with more declarations.
6. **Every bug becomes a test first.** Write the test that reproduces the bug and see it fail,
   then fix it. A test that was already green proves nothing about the fix.
7. **Bind attributes with `:attr=`, never with `${}`.** The compiler warns with
   `PDX_RAW_INTERPOLATION`.
8. **`@page` is metadata, not a restriction.** A component with `@page` stays usable anywhere as a
   custom element.
9. **Routes are destroyed by default, and `keepAlive` is opt-in.** A frozen route is kept in a
   `DocumentFragment` and costs no CPU.
10. **The signal rewriter never rewrites an object key.**

A few failures are silent. Know them before you meet them:

- **A component that is not exported is not registered, and nothing says so.** A `<pdx-*>` tag is
  auto-imported through the `exports` of `packages/ui/package.json`. A new component needs three
  things: its export, which `pnpm --dir packages/ui run manifest` and then `run exports` generate;
  an import in `packages/ui/src/index.ts`; and a restart of Vite with `--force`, because the
  resolver reads `package.json` at start-up. `pdx check` reports an
  unresolved tag as `PDX_UNRESOLVED_COMPONENT`.
- **A `ctx.track()` that returns before it reads a signal never runs again.** Read the signals
  first, then touch the DOM in a frame. The pattern is in
  [core.md, "The pattern for touching the DOM"](docs/architecture/core.md#the-pattern-for-touching-the-dom).
- **Scheduling uses microtasks (`queueMicrotask`), not `requestAnimationFrame`.** A frame does not
  fire in a background tab or a headless browser.
- **A CSS class name can collide.** Before you name one, search `packages/design` for
  `.pdx-{name}`.

Package boundaries: `@pdxui/ui` depends on `@pdxui/core` alone, and `core` has no npm
dependencies.

## Writing `.pdx`

An event handler takes any of these forms. The compiler rewrites a signal write into `.set()`:

```html
<button @click="save">                        <!-- a reference -->
<button @click="count++">                     <!-- an inline mutation -->
<button @click="open = !open">
<button @click="save(item)">                  <!-- a call -->
<input  @input="e => name = e.target.value">  <!-- a lambda -->
<button @click="a(); b()">                    <!-- several statements -->
<img    @load="measure($event)">              <!-- the raw event -->
```

The modifiers `.prevent`, `.stop`, `.self`, `.once`, `.capture` and `.passive`, and key filters,
are applied at runtime. Block modifiers go between the parenthesis and the brace:
`@for (items as item; track item.id) @transition('fade') @stagger(50) { … }`. The template syntax
is documented in [template.md](packages/site/content/docs/template.md).

To remove an attribute, bind `null`, not `undefined`: `:aria-disabled="off ? 'true' : null"`.

## Components

A component in `packages/ui` follows one workflow:

1. **Research.** Survey what the established libraries offer for it: props, variants, sizes,
   states, keyboard, ARIA and mobile behaviour. Decide what is required, what sets it apart, and
   what is out of scope.
2. **Design the API** before the code: props with types and defaults, events (`pdx-{action}`),
   slots, CSS classes, keyboard and ARIA.
3. **Implement** in `packages/ui/src/{name}/pdx-{name}.ts`. Build on the design system's classes and
   on the core primitives (focus groups, the overlay stack, selection) instead of reimplementing
   them.
4. **Write a demo page** in `packages/compiler/demo/showcase-new/pages/comp-{name}.pdx`. It shows
   every variant, size and state, and it must also work at 390px wide. Each demo section is a
   component in `pages/sections/comp-{name}/demo-comp-{name}-{slug}.pdx`, composed by the page; the
   form is in [ui-components.md](docs/architecture/ui-components.md#step-4--the-showcase-demo).
5. **Certify it.** Write the manifest described below.

Themes and tokens are documented for designers in [THEMING.md](packages/design/THEMING.md). Two of
its rules are the ones most often broken. First, a fill colour is never a text colour: text takes
`--pdx-color-*-ink`. Second, the density factor is set as an inline style property, not with an
attribute selector.

A change to the CSS in `packages/design/src` reaches a built consumer only after
`node packages/design/scripts/build-css.mjs`. A theme shipped inside `@pdxui/design` is added to the
`@import` list in `packages/design/src/pragmatic-design.css` and to the theme pickers of the showcase
and the site, or it exists but nothing can select it.

## Agent skills

The skills that teach an agent to build with PDX live in `marketplace/plugins/pdxui`, next to the
library they describe. They are tested with it, and the gate fails when one drifts from the code.

- **The catalogue is generated.** The area skills `pdxui-<area>`, the index and the component-strings
  table come from `packages/ui/custom-elements.json`, `packages/site/src/lib/summaries.ts` and the
  events the sources emit. After changing `@pdxui/ui`, run
  `node marketplace/plugins/pdxui/skills/pdxui/tools/gen-catalog.mjs` and commit the result in the
  same change. A note that a props table cannot carry goes in `tools/notes/<tag>.md`.
- **They must read the same in every agent.** `packages/core/tests/skill-portability.test.ts` holds
  the rules: one quoted `description` of at most 300 characters that says what the skill covers and
  when to use it, and no `when_to_use`, which only Claude Code reads.
- **They are installed from the shared skills repository**, `pragmatic-design/skills`. Copy them
  there with `node scripts/sync-skills.mjs <path to the skills repository>`. `tools/` stays
  behind, because it is maintainer material. `--check` fails when the copy there has drifted.

## Tests and the gate

A change is ready when the gate is green:

```bash
pnpm test         # every package: vitest suites, then the browser suites one at a time
pnpm typecheck
pnpm lint         # 0 errors; the warning count is a ratchet and must not rise
```

While you work, run only what you touch, for example
`pnpm --filter @pdxui/core exec vitest run tests/signal.test.ts`.

If you change a component, whether its CSS, ARIA, geometry or themes, also run:

```bash
pnpm certify          # Playwright: contract geometry, axe, hostile-CSS isolation, keyboard — 13 themes
pnpm certify:visual   # Docker: visual regression against the committed baselines
```

The `pre-push` hook runs `pnpm typecheck`, `pnpm lint`, `pnpm test` and the compiler benchmarks.
Certification runs in CI on every pull request, all five dimensions. To run it before the push as
well, push with `PDX_CERTIFY=1`: for a change to a component's look or geometry, a red seen before
the push saves a round trip.

**Certification is declared, not scripted.** Each component has one hand-written manifest,
`packages/responsive/tests/manifests/{name}.manifest.ts`. The manifest holds isolated scenarios
with `data-test` hooks on every measurable element, and the rules to measure: universal ones,
per-theme overrides, composition, state and positioning. `pnpm certify:gen` generates the scenario
pages from the manifests, and `pnpm certify` runs it first. Never edit anything under a
`generated/` folder; change its generator instead. A new rule must be able to fail: change its
value once and watch it go red.

### Comparing with other frameworks

`pnpm bench:jfb` runs the public
[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) with PDX and the
reference frameworks, and prints a table of medians with each one's ratio to vanillajs: total and
script time, memory, bundle size.

```bash
pnpm bench:jfb                                # PDX against vanillajs, svelte, solid, lit and vue
pnpm bench:jfb --with vanillajs --only 01_,07_ # fewer frameworks, fewer benchmarks
pnpm bench:jfb --runs 3                       # three whole runs, the median of their medians
```

Run it before and after a change to rendering, reactivity or the runtime's size, and compare the two
tables. **Compare only within one run.** Totals move between runs on the same machine, so
frameworks are measured together, and a "before" is a run made the same day, on the same machine,
with nothing else working.

It is not part of `pnpm test`. It needs Chrome, opens a browser window, and takes several minutes
per framework. The benchmark is cloned at a pinned commit into the OS temp directory, with its own
dependencies; the next run reuses it. PDX is built from your checkout: core, compiler, then the app
in `scripts/bench-jfb/`. A PDX build that is not keyed stops the run before anything is measured.
`node --test scripts/bench-jfb/summarize.test.mjs` tests the table.

## Commits and pull requests

- One logical change per commit, in the imperative, with a scope.
- The body says what was wrong, how you know it is fixed, and which test proves it.
- A change an application can notice gets a [CHANGELOG](CHANGELOG.md) entry under *Unreleased*.
- Everything in the repository is written in English: code, comments, test names, docs and commit
  messages. `packages/core/tests/docs-language.test.ts` enforces this.
- Do not edit lockfiles, `dist/` or generated files by hand.

### Commit messages

`scripts/commit-message-check.mjs` checks every message. The `commit-msg` hook runs it on your
machine, and a pull-request workflow runs it on the title, the description (a pull request is merged
by squash, so those become the commit) and every commit in it. A message is accepted when:

- the header is `type(scope): description`, at most 72 characters, with the description in
  lowercase: `fix(ui): pdx-menu updates a same-shape items array in place`. The types are `feat`,
  `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style` and `revert`, and `!`
  before the colon marks a breaking change;
- it names nothing a reader cannot open: no issue-tracker key, no link to a private session;
- it carries no assistant co-author trailer, because the author is the person who signs the commit;
- it holds no path from your machine.

Messages git writes itself (`Revert "…"`, `fixup!`, `squash!`) pass as they are. To check a message
before committing: `node scripts/commit-message-check.mjs --text "fix(ui): …"`.

## Licensing of contributions

Everything in the repository is MIT ([docs/LICENSING.md](docs/LICENSING.md)), and a contribution is
made under the same license: what comes in goes out on the terms everything else does. There is no
contributor license agreement to sign.
