# @pdxui/core

The runtime of PDX UI: signals, the template engine, the Web Component base, and the
services an application builds on — forms, data loading, HTTP, i18n, permissions, accessibility
helpers. It has no npm dependencies.

The `.pdx` compiler emits code that runs against this package, and it can also be used directly
from TypeScript.

```bash
pnpm add @pdxui/core
```

```ts
import { signal, computed, effect } from '@pdxui/core';

const count = signal(1);
const doubled = computed(() => count() * 2);
effect(() => console.log(doubled()));   // 2
count.set(v => v + 1);                  // 4
```

## Entry points

| Import | Contents |
|--------|----------|
| `@pdxui/core` | Everything |
| `@pdxui/core/reactivity` | `signal`, `computed`, `effect`, `batch`, `onCleanup`, `ref` |
| `@pdxui/core/renderer` | `html` and the template helpers |
| `@pdxui/core/component` | `component()`, the element base, provide/inject |
| `@pdxui/core/i18n` | Locales, `$t`, plural and ICU messages |
| `@pdxui/core/testing` | `mount`, `tick`, `fireEvent`, `waitFor`, `cleanup` |
| `@pdxui/core/devtools` | The development overlay and signal inspector |
| `@pdxui/core/hydrate` | `installHydration`, for an app whose pages are generated: the client adopts the server's markup |
| `@pdxui/core/server` | `renderToString`, for static generation in Node |
| `@pdxui/core/server-dom` | `installServerDom`, the server DOM, installed before anything else of core is imported |

Each sub-path is a module of its own, sharing one reactive state with the root, so a `signal` from
`@pdxui/core/reactivity` drives an `effect` from `@pdxui/core`. A sub-path costs what it holds: one
`signal` is 1.8 KB gzip from `/reactivity` and 3.6 KB from the root in a production Vite build.
`@pdxui/core/renderer` exports the template helper as `pipe`, which the root names `templatePipe`; the
root's `pipe` is the reactivity operator.

## Documentation

- [Reactivity](https://pdxui.com/docs/concepts) and [signal operators](https://pdxui.com/docs/signal-operators)
- [Forms](https://pdxui.com/docs/forms), [data](https://pdxui.com/docs/data), [i18n](https://pdxui.com/docs/i18n)
- [Architecture of the runtime](../../docs/architecture/core.md)

## License

[MIT](../../licenses/LICENSE-MIT.txt).
