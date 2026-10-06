# @pdxui/cli

The `pdx` command for PDX UI projects. Install it as a dev dependency:

```bash
pnpm add -D @pdxui/cli
```

| Command | What it does |
|---------|--------------|
| `pdx dev` | Development server with HMR: `.pdx` files are interpreted, with no build |
| `pdx build` | Production build, compiled with knowledge of the whole project |
| `pdx check` | Validates `.pdx` files: structured diagnostics with suggested fixes (`--json`, `--fix`) |
| `pdx new component\|page\|project <name>` | Scaffolding |
| `pdx analyze` | Writes the component manifest (`pdx-manifest.json`) |
| `pdx theme <name> --brand <color>` | Generates a theme that passes WCAG AA from a brand colour |
| `pdx i18n extract\|types\|validate` | Translation keys: a template, typed keys, dictionary checks |
| `pdx builder` | Starts the component tester and theme builder |

A `pdx.config.ts` at the project root configures `root`, `routes`, `outDir` and plugins. A config
file that exists and cannot be loaded stops the command with the error. It never falls back
silently to the defaults.

## Documentation

[CLI](https://pdxui.com/docs/cli) and [making a theme](https://pdxui.com/docs/making-a-theme).

## License

[MIT](../../licenses/LICENSE-MIT.txt).
