# Framework integration demos

The same `@pdxui/ui` Web Components rendered in **React**, **Vue 3** and **Angular** —
each installs the packages from npm, as any consumer would,
and wires the components idiomatically: props, events, and the imperative API.

Each demo shows: `pdx-button`, `pdx-select` (object `options` + `pdx-change` event),
`pdx-data-grid` (`columns` + `data`), and `pdx-dialog` opened via its imperative `.show()` method.

## Prerequisite

Node 18 or later. The `@pdxui/*` packages come from the public npm registry, pinned to one
release in each app's `package.json`, with a lockfile.

## Run

```bash
cd react   # or vue, or angular
npm ci
npm run dev
```

| App | Port | Custom-element wiring |
|-----|------|-----------------------|
| `vue/`     | 5401 | `isCustomElement` (vite); object props via `:prop.prop`, events via `@pdx-...` |
| `react/`   | 5402 | object props + events via `ref` (two small hooks); `onClick` for imperative calls |
| `angular/` | 5403 | `CUSTOM_ELEMENTS_SCHEMA`; `[prop]` bindings, `(pdx-event)`, template-ref `.show()` |

## Per-framework notes

- **Vue 3** — easiest. Configure the compiler to treat `<pdx-*>` as custom elements
  (`compilerOptions.isCustomElement`). Bind array/object props with the `.prop` modifier so
  Vue sets them as DOM properties (`:columns.prop="..."`), not stringified attributes.
- **React** (≤18) — JSX stringifies object props to attributes and doesn't wire hyphenated
  events, so object props and `pdx-*` events are set via a `ref` (see `useProp`/`useEvent`).
  Plain `onClick` works for calling imperative methods. React 19 improves property binding.
- **Angular** — add `CUSTOM_ELEMENTS_SCHEMA` to the component. `[prop]` binds DOM properties
  (works for arrays/objects), `(pdx-change)` binds the custom event, and a template ref
  (`#dialog`) gives the element to call `.show()`. Runs on Vite in JIT mode (esbuild transpiles
  the decorators; `@angular/compiler` compiles templates at runtime — no special Angular plugin).
