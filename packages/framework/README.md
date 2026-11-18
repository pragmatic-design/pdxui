# @pdxui/framework

The PDX UI runtime in one install: `@pdxui/core`, `@pdxui/design`, `@pdxui/ui`
and `@pdxui/router`.

```bash
pnpm add @pdxui/framework @pdxui/compiler
pnpm add -D @pdxui/cli
```

| Import | Contents | An app that takes one export from it ships |
|--------|----------|------|
| `@pdxui/framework` | Everything the four packages export, and **every component registered on import** | ~340 KB gzip |
| `@pdxui/framework/core` | Core's API | ~4 KB for a `signal` |
| `@pdxui/framework/router` | The router | ~14 KB for `navigate` |
| `@pdxui/framework/ui` | Every component registered | ~332 KB |
| `@pdxui/framework/css` | Everything the design system styles — every component and all 13 themes — for a page that does not know which components it will render | CSS, not counted here |

Registering is a side effect, so no bundler can drop a component the root registers: code that needs
the API imports `/core` or `/router`. The numbers are a production build of a module that imports one
export (`tests/entry-cost.test.ts`, which holds them). A `.pdx` app imports each component it uses
through the compiler, not through this package.

An app that knows what it renders imports `@pdxui/design/base` and one theme
(`@pdxui/design/themes/neutral` applies with no `pdx-theme` on `<html>`), and each component
brings its own CSS; that is what `pdx new project` writes.

The CLI is a separate dev dependency, and so is the compiler, which is a build-time Vite plugin.
Neither ships to the browser. An application that wants to choose its packages installs them one
by one instead.

Start from [Getting Started](https://pdxui.com/docs/getting-started).

## License

[MIT](LICENSE), as are the packages it bundles. See [docs/LICENSING.md](../../docs/LICENSING.md).
