---
title: CLI
description: "The pdx commands: develop without a build, compile, validate, scaffold, theme, translate."
order: 4
---

# CLI

The `pdx` CLI is the entry point to the workflow. The key concept to internalize is that
**development and production are two different worlds** (see [The Compiler](/docs/compiler)): in dev
there's no compilation to wait for, in prod there's a build that optimizes with global knowledge.

## The commands

The CLI is its own package and a **dev dependency**: `@pdxui/framework` does not include it, and
without the install `npx pdx` asks the public registry for a package called `pdx` and gets a 404.

```bash
npm i -D @pdxui/cli   # once per app
npx pdx dev       # interpreted dev server + HMR — your daily loop
npx pdx build     # compiled, optimized build — for production
npx pdx check     # validation + PDX_* diagnostics (no build)
npx pdx explain   # what a PDX_* code means, and what to write instead
npx pdx new       # scaffold a component/project
npx pdx analyze   # the project manifest: components, their API, the routes
npx pdx mcp       # the CLI as an MCP server, for an agent
npx pdx builder   # component tester + theme builder, on your own components
npx pdx theme     # generate a WCAG-AA theme from a brand color
npx pdx i18n      # extract keys, generate typed keys, validate dictionaries
npx pdx extract   # translation keys → template JSON
```

## pdx dev — develop without a build

```bash
npx pdx dev
```

You wait for no compilation: the runtime interprets `.pdx` on the fly, with hot-reload. Change a
component and see it update instantly. It's by design that development does *not* require a build —
the build is only for production.

## pdx build — production

```bash
npx pdx build
```

Here the compiler knows the whole project and generates the optimized output (inlined bindings,
pre-compiled templates, pre-linked routes, dead code removed). It produces the static artifacts to
serve.

Source maps are off by default. `--sourcemap` turns them on, and they point at the line of the `.pdx`
you wrote, not at the generated code:

```bash
npx pdx build --sourcemap hidden   # .map files, no sourceMappingURL comment
npx pdx build --sourcemap true     # .map files, named by a comment in each chunk
```

`hidden` is the form for an error tracker: upload the `.map` files to it and leave them off the
server, so a stack trace from production resolves to your source while the browser never asks
for the maps. With `--standalone`, each component gets a `<name>.js.map` beside its `<name>.js`.

`--outDir` writes somewhere other than the config's (`dist` by default); `--minify` is on by
default, and `--no-minify` leaves the output readable.

## pdx check — the quality gate

```bash
npx pdx check
```

Runs the **same checks** as the compiler and emits the structured diagnostics (`PDX_*` codes with
hints), without producing a build. It's meant for CI: drop it in the pipeline and block merges that
introduce problems (a `${}` in an attribute, a non-reactive variable used in the template, an invalid
prop type) *before* they reach production.

```bash
npx pdx check --json              # the report as JSON, for an agent or a script
npx pdx check --fix               # apply the fixes findings carry, then report what is left
npx pdx check --max-warnings 0    # exit 1 when there are more warnings than this
npx pdx check --design            # add the design review: heuristics and cross-file rules
npx pdx check --types             # add the TypeScript check of scripts and templates
npx pdx check --severity error    # report only errors (error, warn — the default — or info)
npx pdx check --i18n              # add the translation keys: one missing in a locale is a warning
```

`--types` runs the type-check the editor shows, without an editor: the script and every template
expression of every `.pdx`, in one TypeScript program, with the project's `tsconfig.json` for paths
and libraries. Each error is a `PDX_TS` finding at its line in the `.pdx`, with the TypeScript code
in `tsCode`, and counts as an error — a handler that calls `saved('no')` where `@event saved: number`
is declared fails the check. It uses the project's TypeScript, so the project needs `typescript`
installed.

`pdx check` is the **gate**: it reports defects — what is wrong whatever the reviewer thinks.
`pdx check --design` is the **review**: it adds the design rules of
[Component Design](/docs/component-design) that are questions rather than verdicts — a file that
holds several pieces, a colour written as a value, logic copied across pages. In `--json` every
finding carries its `category`, `defect` or `design`. The dev server prints defects too, and the
design questions only with `pdx({ design: true })`.

Errors always exit 1; warnings do only past `--max-warnings`. Each finding names its place as
`file:line:column`. Some findings carry a **fix**: in `--json` it is `fix: { title, edits }`, each
edit an offset range into the `.pdx` file (`start`, `end`, `newText`) with its `line`/`column` and
`endLine`/`endColumn`. `--fix` applies them — a fix whose edits overlap another is left out, whole —
and checks the file again, a few rounds, since fixing one finding can uncover another (a `${}` in a
bound value stops the compile, and what the compile finds appears once it is gone). The report then
describes the file **after**: what was applied under `fixed: [{ code, title }]`,
and under `warnings` only what is still there. The editor's quick fixes apply the same edits.

### When a finding is intended

A finding that is right where it is — a palette swatch *is* a colour literal — is exempted in the
file, in the comment form of its block, with the reason:

```html
<!-- pdx-ignore PDX_RAW_INTERPOLATION: the page shows the raw form -->   (template)
/* pdx-ignore PDX_COLOUR_LITERAL: a palette swatch */                     (style)
// pdx-ignore PDX_NON_REACTIVE: read once, on purpose                     (script)
```

It silences that code on the **next line**; `pdx-ignore-file CODE: reason` silences it in the whole
file. An exemption without a reason exempts nothing and is an error (`PDX_IGNORE_WITHOUT_REASON`);
one that silences nothing is reported as `PDX_IGNORE_UNUSED`, so it cannot outlive its cause. The
compiler, the editor and `pdx check` honour the same comments; `--json` counts what they silenced in
`summary.ignored`.

## pdx explain — what a code means

```bash
npx pdx explain PDX_RAW_INTERPOLATION          # the entry, for a person
npx pdx explain PDX_RAW_INTERPOLATION --json   # the same entry, for an agent
```

Prints the catalog entry for a code: its severity, what it means, what to write instead, and its
address on [Diagnostics](/docs/diagnostics). A misspelt code exits 1 and names the closest one. In
`pdx check --json`, every finding carries the same address as `url`.

## pdx new — start fast

```bash
npx pdx new
```

Scaffolds a new component or project following the correct patterns, so you don't start from an empty
file: `pdx new component user-card`, `pdx new page settings`, `pdx new project shop`. `--dir` puts it
somewhere other than the current folder. A project comes with an `AGENTS.md`, which tells an AI agent
opened in it how to work — see [Using PDX with an AI agent](/docs/agents).

A new project depends on `@pdxui/framework`, with `@pdxui/cli`, `@pdxui/compiler` and `vite` as dev
dependencies, all at the version of the CLI that created it; its `index.html` imports the design system
once and places `<pdx-app>`. Start it from a folder with no project yet with
`npx @pdxui/cli new project shop`, then `npm install` and `npm run dev`.

## pdx analyze — the project manifest

```bash
npx pdx analyze                     # writes pdx-manifest.json
npx pdx analyze --out docs/api.json # somewhere else
npx pdx analyze --json              # prints it, writes nothing — the form for an agent
```

Reads every `.pdx` of the project and describes it as data. `components` lists each one with the tag
it registers (the compiler's rule: `App.pdx` is `pdx-app`, or its `@tag`), its file, props with type
and default, events with their payload, slots, exposed methods, signals, stores, `@fetch` endpoints,
`@form` fields, and the other components it uses. `routes` is the route table: every component with
`@page`, sorted by path, as `{ path, file, tag, guard, loader, layout }`.

It is what an agent reads before it touches a project: which components exist and how to call them,
and which page answers which URL, without opening a file.

## pdx mcp — the CLI, for an agent

```bash
npx pdx mcp
```

Starts an [MCP](https://modelcontextprotocol.io) server over stdio, rooted at the current folder, so
an agent calls the CLI as tools instead of running commands and reading their text:

- `check` — the `pdx check --json` report: each finding with its position and, when it has one, the
  fix as text edits. `files`, `design` and `types` narrow or widen it; `fix: true` applies the fixes;
- `explain` — a `PDX_*` code's catalog entry;
- `component` — one component's props, events, slots, methods, description and the import the
  compiler writes for it; `components` — every tag with a one-line description, filtered by `query`;
- `project` — the `pdx analyze` manifest, routes included;
- `docs` — the sections of this documentation that best match `query`, with their URLs.

Every answer is JSON. Add it to an agent that speaks MCP — in Claude Code, from the project folder:

```bash
claude mcp add pdx -- npx pdx mcp
```

## pdx builder — see and measure

```bash
npx pdx builder --port 5230 --open
```

Serves the [Theme Builder](https://themebuilder.pdxui.com/) against your project: every
component in a chosen theme, scheme and viewport, with contrast, overflow and touch targets
measured on the rendered page. `--host` if you need it reachable from a device.

## pdx theme — generate a theme

```bash
npx pdx theme acme --brand "#6442d6" --language material --out src/themes/acme.css
```

One brand color and an archetype produce a complete, WCAG-gated theme. `--strict` is **on by
default**, so the command exits non-zero when a contrast pair fails AA — it is a CI check as much
as a generator. The rest is optional: `--accent` and `--focus` (hex or `oklch()`, derived from the
brand when omitted), `--neutral` (a hue 0–360 for the grey tint), `--density` (`compact`, `normal`,
`comfort`), `--radius` (`sharp`, `rounded`, `pill`), and `--quiet` to leave out the validation report.
Workflow: [Making a theme](/docs/making-a-theme).

## pdx i18n — keys, types, dictionaries

```bash
npx pdx i18n extract                # scan .pdx/.ts for $t() keys → translations/template.json
npx pdx i18n types --locale en      # generate i18n-keys.d.ts so $t() is type-checked
npx pdx i18n validate               # missing/orphan keys per locale + malformed ICU messages
```

`pdx i18n validate --strict-orphans` also fails on keys nobody uses. See [i18n](/docs/i18n) for
the runtime side.

**Where it looks for dictionaries**: `translations/*.json`, `locales/*.json` and
`public/locales/*.json`, under the source root and the project root. Anywhere else, say so:
`pdx i18n validate --dicts "i18n/**/*.json"`. When it finds nothing it prints every place it tried.

**A composed key is a prefix, not a key.** `$t('nav.' + key)` and ``$t(`nav.${key}`)`` are read as
the prefix `nav.`: never reported as missing, and every dictionary entry under it counts as used —
so `--strict-orphans` is usable in an app that translates an enum. A prefix that matches no entry
at all is a warning, because at runtime it renders the raw key.

**Two registries, and it tells them apart.** `$t('router.notFound')` renders the raw key:
`router.notFound` belongs to the component string registry, not to your dictionary. `validate`
reports it by name and points at `setLocaleStrings`, instead of counting it as a missing
translation you would then add where nothing reads it.

`pdx extract` is the older standalone form of `pdx i18n extract`, writing to
`src/translations/template.json` (`--output` for another file). New projects should use the
subcommand.
