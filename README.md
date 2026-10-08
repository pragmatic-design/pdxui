# PDX UI

[![Quality](https://github.com/pragmatic-design/pdxui/actions/workflows/quality.yml/badge.svg)](https://github.com/pragmatic-design/pdxui/actions/workflows/quality.yml)
[![Component Certification](https://github.com/pragmatic-design/pdxui/actions/workflows/certify.yml/badge.svg)](https://github.com/pragmatic-design/pdxui/actions/workflows/certify.yml)
[![npm](https://img.shields.io/npm/v/@pdxui/core?label=npm&logo=npm)](https://www.npmjs.com/package/@pdxui/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-1.0.0--alpha.1-ffe088)](CHANGELOG.md)

**[Documentation](https://pdxui.com)** · **[Theme builder](https://themebuilder.pdxui.com)** ·
**[Packages](https://www.npmjs.com/org/pdxui)** ·
**[Agent skills](https://github.com/pragmatic-design/skills)**

**Declare what a screen does. The compiler writes the wiring around it.**

PDX UI is a framework for the front end of line-of-business software: lists, records, forms,
dashboards. You write `.pdx` single-file components and declare what is specific to the screen:
its route, its data, its state, its events. The compiler writes what is not: component
registration, the route table, lazy loading, reactive bindings, scoped CSS, types. The output is
standard Web Components, and it ships with **115 components** built for that kind of software and a
design system with **13 themes**.

It is the front-end half of the same idea as [Pragmatic.Design](https://github.com/pragmatic-design/Pragmatic.Design):
**when you find yourself writing the same wiring twice, the framework has a bug**, and the fix is a
declaration the compiler turns into that wiring.

> [!TIP]
> **Start here with your agent.** Give your coding agent the `pdxui` skills from
> **[pragmatic-design/skills](https://github.com/pragmatic-design/skills)**: the `.pdx` language,
> every component one page each, screen recipes, theming, data, routing, testing.
>
> ```bash
> claude plugin marketplace add pragmatic-design/skills   # Claude Code
> claude plugin install pdxui@pragmatic-design
>
> codex plugin marketplace add pragmatic-design/skills    # Codex
> codex plugin add pdxui@pragmatic-design
> ```
>
> Any agent that reads the Agent Skills format can load the folders directly.
> [Using PDX with an AI agent](https://pdxui.com/docs/agents) has the check loop and the MCP server.
>
> Writing the code yourself: [Getting started](https://pdxui.com/docs/getting-started).

---

## One file, a whole screen

This is a real page from the [showcase](packages/showcase/), a service-desk application built to
measure the framework against real screens (abridged, imports left out; the comments are added here).
`<pdx-list-header>` is the showcase's own component; the others come from `@pdxui/ui`:

```pdx
<template>
  <section class="page">
    <pdx-list-header :title="$t('employees.title')" store-key="employees" :grid="gridEl" :source="source">
      <span>{{ $t('employees.matching', { count: total }) }}</span>
      <pdx-button variant="primary" @click="creating.open.set(true)">{{ $t('employees.new') }}</pdx-button>
    </pdx-list-header>

    <pdx-data-grid :ref="gridEl" :source="source" :columns="columns"
                   show-toolbar search row-clickable
                   @pdx-row-click="e => openRecord(e.detail.row)"></pdx-data-grid>

    <pdx-dialog :open="createOpen" :title="$t('employees.new')" @pdx-close="creating.open.set(false)">
      <pdx-auto-form :schema="schema" @pdx-submit="e => creating.create(e.detail?.values ?? {})"></pdx-auto-form>
    </pdx-dialog>
  </section>
</template>

<script setup>
@page '/employees' { label: $t('employees.title') };   // a route, lazy-loaded, with its label
@title $t('employees.title');                         // the document title, kept in step with the language
@scroll 'preserve';                                   // back from a record, the list is where you left it

const source = createDataSource({ transport: employeeTransport, pageSize: 10 });  // paging, sort, filter, search

const columns = $derived([                            // recomputed when the language changes
  { field: 'lastName', header: $t('employees.columns.lastName'), filterable: true, searchable: true },
  { field: 'country', header: $t('employees.columns.country'), groupable: true, quickFilter: true },
  { field: 'hired', header: $t('employees.columns.hired'),
    format: (v) => (v ? $d(String(v), { dateStyle: 'medium' }) : '') },
]);

const total = $derived(source.total());
let gridEl = $signal(null);

function openRecord(row) { navigate(`/employees/${row.id}/personal`); }
</script>
```

The page imports its own data helpers and a few runtime functions (`createDataSource`, `navigate`).
There is no import of the components it uses, no `customElements.define`, no route registration, no `return`
listing what the template may read, and no `.value` or `()` on the signals in the template. Each of
those is wiring, and wiring is the compiler's job.

---

## What the compiler writes for you

That page is [`employees.pdx`](packages/showcase/src/pages/employees.pdx), 110 lines. Compiled, it
becomes 138 lines of plain JavaScript, and every part of them comes from a declaration:

| From | The compiler writes |
|---|---|
| The file name | A custom element, `<pdx-employees>`, registered with `component()` |
| `@page '/employees'` | A route table entry: path, tag, label key, scroll policy, and a lazy `import()` so the page is its own chunk |
| `@title` | An effect that keeps `document.title` in step with the language |
| `$signal`, `$derived`, `$watch` | `signal()`, `computed()` and `watch()`, named for the devtools: a signal after the file and the variable (`employees:total`), a watch after the file and the line (`employees.pdx:63`) |
| The template | Reactive bindings; `{{ total }}` reads the signal without you writing a call |
| `@click`, `@pdx-row-click`, … | Event handlers wrapped so an exception is reported with the component and the event that raised it |
| `<style scoped>` | CSS scoped to the component; in a production build, extracted to a stylesheet of its own |
| `<pdx-data-grid>`, `<pdx-dialog>`, … | The import of each component the template uses, and only those |

This is an excerpt of the output, the start of the setup and the route entry (reformatted):

```js
component('pdx-employees', {
  props: {},
  setup(ctx) {
    const __gridEl = signal(null, { name: 'employees:gridEl' });
    const source = createDataSource({ transport: employeeTransport, pageSize: 10 });
    const total = computed(() => source.total(), { name: 'employees:total' });
    // …
    ctx.track(() => { document.title = $t('employees.title'); });
    return { source, /* … */ total, gridEl: __gridEl, openRecord };
  },
  render: (ctx) => html`…`,
});

// Auto-route: @page '/employees'
__pdx_pushRoute({ path: "/employees", tag: "pdx-employees", scroll: "preserve",
                  labelKey: "employees.title", lazy: true, file: './employees.pdx' });
```

In development nothing is built: `pdx dev` interprets templates, with hot reload. `pdx build`
compiles with knowledge of the whole project: routes split into chunks, the landing route's chunk
preloaded, bindings inlined, CSS extracted, diagnostics stripped. The two must render the same; the
compiler's parity tests compare them, and a difference between the two is a compiler bug.

---

## What it believes

**Declare intent; let the compiler write the plumbing.** If a developer writes the same wiring
twice, that is a framework bug, and the fix is a declaration.

**One right way for each common thing.** A screen built by one person, by another or by an agent
should look the same, so it can be read, reviewed and generated.

**Standard output.** A PDX component is a custom element. It works in a plain HTML page, and inside
Angular, React or Vue ([integrations](integrations/)).

**Nothing hidden.** No runtime reflection, no magic strings resolved at startup: everything traces
from the `.pdx` to the JavaScript it became, and the compiler's output is ordinary code you can read.

**Mistakes are diagnostics.** What the compiler can see is wrong, it says, with a code, a location,
a hint and often a fix.

**A component is done when it is measured, not when it looks right.** Geometry, accessibility,
keyboard and appearance are measured in a browser, in every theme ([below](#how-we-know-it-works)).

---

## The compiler is on your side

It does not only translate; it reads what you declared and says when it cannot work. A small
component with two mistakes in it:

```pdx
<template>
  <article class="card">
    <a href="/orders/${id}">{{ title }}</a>
    <p>{{ total }}</p>
  </article>
</template>

<script setup>
@prop id: string = '';
@prop title: string = '';
const total = $derived(0);
let total = $signal(0);
</script>
```

and what the compiler reports for it (code, position, message and hint, verbatim):

```text
PDX_RAW_INTERPOLATION  warn   3:22
  Raw '${id}' in template is not reactive. Use {{ ... }} for text, or :attr="..." for attributes.
  Hint: Replace '${id}' with {{ id }} (text) or bind via :attr="id".

PDX_DUP_DECLARATION    error  12:1
  'total' is declared twice: $derived on line 11 and $signal on line 12. The compiled component keeps
  one of them, and nothing says which.
  Hint: Rename one of them, or remove the one you do not mean.
```

There are **61** of these, each in the [diagnostics catalogue](https://pdxui.com/docs/diagnostics).
`pdx check --json` reports them with their positions and the fixes as text edits, `pdx check --fix`
applies them, and `pdx check --types` adds the TypeScript check of scripts and templates.

---

## Why a compiler, when an agent can write the code?

Because wiring is where agents are weakest too, and the cost moves rather than disappears.

An agent will write the registration, the route entry, the lazy import, the store subscription and
the cleanup for your screen, and again for the next one, a little differently each time. Every copy
is code to review before you trust it, and front-end wiring is the kind that looks right and leaks:
a listener that is never removed, an effect that subscribes to nothing, a binding that is not
reactive. The compiler writes it one way, tested once, for everybody.

It also makes the agent better at the part that is left:

- **The context is small.** A screen is one file of declarations and markup. An agent reads it, and
  so do you.
- **The feedback is immediate.** `pdx check --json` gives the agent a code and a location to act on,
  and `pdx mcp` serves the same answers as tools: a loop it can close before a person looks.
- **The framework can be taught.** The `pdxui` plugin ships 18 skills, and the documentation is
  served whole to a model at [`/llms-full.txt`](https://pdxui.com/llms-full.txt).

You still read what the agent wrote. There is less of it, and none of it is plumbing.

---

## What's in the box

| Area | What you get |
|---|---|
| **Language & compiler** | `.pdx` single-file components; `@prop`, `@event`, `@expose`, `$signal`, `$derived`, `$store`, `$watch`; control flow (`@if`, `@for`, `@defer`, `@try`); scoped CSS; a Vite plugin; typed `.d.ts` per component |
| **Runtime** | Signals with glitch-free computed values; a template engine with keyed list reconciliation; lifecycle hooks; provide/inject; permissions; a dependency-free core |
| **Routing** | `@page` routes, nested routes, guards, lazy loading, scroll restoration, keep-alive pages |
| **Data** | Data sources with paging, sorting, filtering and search; resources with cache and retry; mutations; an HTTP client |
| **Forms** | Schema-driven forms, validation, field arrays, auto-forms from a schema |
| **Components** | 115 custom elements: a data grid with views, filters, grouping and CSV/Excel export; inputs, pickers, overlays, navigation, layout, feedback, charts |
| **Design system** | Tokens, 13 themes, light and dark, density, a theme engine whose colours are checked against WCAG contrast, and a [theme builder](https://themebuilder.pdxui.com) |
| **i18n** | Translations with ICU plurals, and dates and numbers in the user's locale |
| **Tooling** | `pdx dev · build · check · new · theme · mcp`; a language server and a [VS Code extension](packages/vscode-pdx); devtools; test utilities |

---

## Why not…

- **…React?** React renders components through a virtual DOM, and a React component lives inside a
  React tree. A PDX component is a custom element: no virtual DOM, and it runs in any page or
  framework. Where React leaves registration, routing and data wiring to libraries you assemble, here
  they are declarations in the file.
- **…Vue?** The single-file components will look familiar, `<script setup>` included. The difference
  is the output: standard custom elements by default rather than Vue components. The route and the
  title are declared in the file rather than configured in the router, and the components a template
  uses need no import. And the component library and the design system are designed with the compiler.
- **…Svelte?** Svelte is a compiler too, and SvelteKit adds routing, loading and form actions. PDX
  compiles to custom elements by default, and pairs the compiler with a component library and themes
  built for line-of-business screens and certified in every theme.
- **…Angular?** Angular is a complete platform: modules, decorators, its own dependency injection
  and change detection. A PDX component is a plain custom element with signals, so there is less to
  learn, and it runs inside Angular too ([example](integrations/angular)).
- **…Lit?** Lit is a library for writing Web Components by hand: a class, decorators, a template
  function. In PDX you write declarations and the compiler writes the registration and the reactive
  wiring, and you get a router, a data layer and a component library with it.

**It is probably not for you (yet)** if you need a stable 1.0 today, server-side rendering or static
generation (on the roadmap, not available), or a framework whose library ecosystem you already depend
on.

---

## How we know it works

A framework that writes your wiring has to be more reliable than the wiring it replaces. Every push
runs the whole gate on the machine it comes from; CI runs the suites again on every pull request, and
the certification on every pull request that touches the components, the design system or the
certification itself. The last full run was **21,901 tests**:

- **11,833 unit tests** across the compiler, the runtime, the router, the language server, the
  components and the CLI, and **23 benchmarks**, among them one that keeps compile time linear in the
  number of declarations.
- **1,659 browser tests** on the design system, the theme builder, the documentation site and the
  showcase application, on its production build and on the development server.
- **Component certification: 6,678 tests**, plus **1,708 visual tests**. The components are
  described by [106 manifests](packages/responsive/tests/manifests/) of scenarios, and each scenario
  is measured in all 13 themes, in a browser: geometry and contrast, axe accessibility, immunity to
  hostile page CSS, the WAI-ARIA keyboard pattern, and screenshots compared against baselines made
  in a pinned Docker image.

**Ratchets that only go one way.** The showcase's bundle has a budget the build is measured against:
33.8 KB gzipped for the entry module and 82.6 KB before the first paint, with a cap on headroom so a
budget cannot drift far above the real number. Lint warnings and coverage thresholds are held the
same way.

**Claims are tests.** What the production build does that development does not is asserted, not
described: extracted CSS, stripped diagnostics and a preloaded landing route on a real build of the
showcase, in [`compiler-claims.spec.ts`](packages/showcase/tests/compiler-claims.spec.ts) and the
specs beside it; inlined bindings and the parity of the two modes in the compiler's own tests.

**Maturity.** This is `1.0.0-alpha.1`. The language, the runtime and the component APIs still change
between releases; every change an application can notice is in the [CHANGELOG](CHANGELOG.md).
Server-side rendering and static generation are on the roadmap.

---

## Getting started

To start a new application:

```bash
npx @pdxui/cli new project shop   # a project, with an AGENTS.md for your coding agent
cd shop
npm install
npm run dev
```

Or add it to an existing Vite project:

```bash
npm i @pdxui/core @pdxui/compiler
```

```ts
// vite.config.ts
import { pdx } from '@pdxui/compiler';
export default { plugins: [pdx()] };
```

Then pick your way in:

- **Build your first screen.** [Getting started](https://pdxui.com/docs/getting-started) goes from
  an empty folder to a working page.
- **Build it with an agent.** [Install the skills](https://pdxui.com/docs/agents) and let the agent
  check its own work with `pdx check`.
- **Just the components.** `@pdxui/ui` and `@pdxui/design` work without the compiler: in a plain HTML
  page from a CDN, or inside [Angular, React or Vue](https://pdxui.com/docs/integration).
- **A theme of your own.** The [theme builder](https://themebuilder.pdxui.com) generates one and
  checks its contrast; [`THEMING.md`](packages/design/THEMING.md) is the guide for designers.

---

## Packages

| Package | What it is |
|---------|-----------|
| [`@pdxui/core`](packages/core) | Signals, templates, components, forms, data, i18n, with no dependencies |
| [`@pdxui/compiler`](packages/compiler) | The Vite plugin: `.pdx` → Web Components |
| [`@pdxui/router`](packages/router) | `@page` routing, guards, lazy routes |
| [`@pdxui/ui`](packages/ui) | 115 components for line-of-business applications |
| [`@pdxui/design`](packages/design) | The CSS design system: tokens, 13 themes, a WCAG-checked theme engine |
| [`@pdxui/cli`](packages/cli) | `pdx dev · build · check · new · theme · mcp` |
| [`@pdxui/lsp`](packages/lsp) | The `.pdx` language server; the [VS Code extension](packages/vscode-pdx) uses it |
| [`@pdxui/framework`](packages/framework) | The runtime in one install |

## Documentation

Full documentation: **[pdxui.com](https://pdxui.com)**. In this repository:

- **How it is built:** [`docs/architecture`](docs/architecture) (start with `framework.md`).
- **How a component is designed:** [`docs/PDX-COMPONENT-DESIGN.md`](docs/PDX-COMPONENT-DESIGN.md),
  the rules the compiler's design checks cite.
- **For designers:** [`packages/design/THEMING.md`](packages/design/THEMING.md).
- **For coding agents working on the framework itself:** [`AGENTS.md`](AGENTS.md).

## Contributing

Issues and pull requests are welcome, from people and from agents. Start with
[CONTRIBUTING.md](CONTRIBUTING.md): it covers the setup, the gate a change must pass, and how a
component is certified. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md), and report
vulnerabilities privately as [SECURITY.md](SECURITY.md) describes. For a question,
[SUPPORT.md](SUPPORT.md) says where to ask.

## License

Everything in this repository is **[MIT](LICENSE)**: every package, the compiler and the component
library included, free for everyone, at any scale, with no threshold and no paid tier. The JavaScript
the compiler emits into your project is yours.

"Pragmatic" and "PDX UI", their names and logos, are trademarks and are not covered by the license: a
fork is welcome, under a name of its own. The project is funded by its sponsors, through
**[GitHub Sponsors](https://github.com/sponsors/pragmatic-design)**; the details are in
**[docs/LICENSING.md](docs/LICENSING.md)**.
