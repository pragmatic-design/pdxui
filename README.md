# PDX UI

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A declarative UI framework for line-of-business applications. You write `.pdx` single-file
components — `@prop`, `@page`, `@fetch`, `$signal` — and the compiler generates the wiring:
component registration, routes, data loading, types. The output is standard Web Components.

Documentation: **[pdxui.com](https://pdxui.com)** · Theme builder:
**[themebuilder.pdxui.com](https://themebuilder.pdxui.com)**

> **Status: alpha.** The APIs still change between releases; every change an application can
> notice is in the [CHANGELOG](CHANGELOG.md).

## A component

```pdx
<template>
  <p>You clicked {{ count }} times</p>
  <pdx-button @click="inc">+1</pdx-button>
</template>

<script setup>
@prop start: number = 0;
@event changed: number;

let count = $signal(start);
function inc() { count++; changed(count); }
</script>
```

`counter.pdx` becomes `<pdx-counter start="10">`. `count++` becomes a signal update, and
`@event` becomes a typed `CustomEvent`. The `<pdx-button>` in the template is imported for you.
There are no imports, no registration and no `return`: if you find yourself writing wiring, the
framework has a bug.

## Quick start

```bash
pnpm add @pdxui/core @pdxui/compiler
pnpm add -D @pdxui/cli
```

```ts
// vite.config.ts
import { pdx } from '@pdxui/compiler';
export default { plugins: [pdx()] };
```

`pdx dev` runs the app interpreted, with HMR and no build. `pdx build` compiles it for production,
with knowledge of the whole project: routes split into chunks, inlined bindings, and extracted CSS.
The [Getting Started](https://pdxui.com/docs/getting-started) guide goes on from here.

## Packages

| Package | What it is | License |
|---------|-----------|---------|
| [`@pdxui/core`](packages/core) | Signals, templates, components, forms, data, i18n — no dependencies | MIT |
| [`@pdxui/design`](packages/design) | The CSS design system: tokens, 13 themes, a WCAG-checked theme engine | MIT |
| [`@pdxui/router`](packages/router) | `@page` routing, guards, lazy routes | MIT |
| [`@pdxui/cli`](packages/cli) | `pdx dev · build · check · new · theme` | MIT |
| [`@pdxui/lsp`](packages/lsp) | The `.pdx` language server; the [VS Code extension](packages/vscode-pdx) uses it | MIT |
| [`@pdxui/compiler`](packages/compiler) | The Vite plugin: `.pdx` → Web Components | MIT |
| [`@pdxui/ui`](packages/ui) | 100+ components for line-of-business applications | MIT |
| [`@pdxui/framework`](packages/framework) | The runtime in one install | MIT |

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md): it covers the
setup, the gate a change must pass, and how a component is certified. Please follow the
[Code of Conduct](CODE_OF_CONDUCT.md), and report vulnerabilities privately as
[SECURITY.md](SECURITY.md) describes. For a question, [SUPPORT.md](SUPPORT.md) says where to ask.

## License

Everything in this repository is **[MIT](LICENSE)** — every package, the compiler and the component
library included — free for everyone, at any scale, with no threshold and no paid tier. The
JavaScript the compiler emits into your project is yours.

"Pragmatic" and "PDX UI", their names and logos, are trademarks and are not covered by the license:
a fork is welcome, under a name of its own. The project is funded through GitHub Sponsors; the
details are in **[docs/LICENSING.md](docs/LICENSING.md)**.
