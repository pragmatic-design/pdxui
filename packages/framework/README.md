# @pdxui/framework

The PDX UI runtime in one install: `@pdxui/core`, `@pdxui/design`, `@pdxui/ui`
and `@pdxui/router`.

```bash
pnpm add @pdxui/framework @pdxui/compiler
pnpm add -D @pdxui/cli
```

| Import | Contents |
|--------|----------|
| `@pdxui/framework` | Everything the four packages export |
| `@pdxui/framework/core`, `/ui`, `/router` | One package at a time |
| `@pdxui/framework/css` | The design system's stylesheet |

The CLI is a separate dev dependency, and so is the compiler, which is a build-time Vite plugin.
Neither ships to the browser. An application that wants to choose its packages installs them one
by one instead.

Start from [Getting Started](https://pdxui.com/docs/getting-started).

## License

[MIT](LICENSE), as are the packages it bundles. See [docs/LICENSING.md](../../docs/LICENSING.md).
