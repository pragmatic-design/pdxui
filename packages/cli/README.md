# @pdxui/cli

The `pdx` command for PDX UI projects. Install it as a dev dependency:

```bash
pnpm add -D @pdxui/cli
```

| Command | What it does |
|---------|--------------|
| `pdx dev` | Development server with HMR: `.pdx` files are interpreted, with no build |
| `pdx build` | Production build, compiled with knowledge of the whole project; `--ssg` writes a page for every static route, which the app hydrates |
| `pdx check` | Validates `.pdx` files: structured diagnostics with suggested fixes (`--json`, `--fix`), and the TypeScript check of scripts and templates with `--types` |
| `pdx explain <code>` | What a `PDX_*` diagnostic means, and how to fix it |
| `pdx migrate` | Rewrites the forms the beta removed or changed, and lists the ones to rewrite by hand |
| `pdx new component\|page\|project <name>` | Scaffolding |
| `pdx analyze` | Writes the component manifest (`pdx-manifest.json`) |
| `pdx mcp` | Serves the CLI to an agent as an MCP server over stdio |
| `pdx theme <name> --brand <color>` | Generates a theme that passes WCAG AA from a brand colour |
| `pdx i18n extract\|types\|validate` | Translation keys: a template, typed keys, dictionary checks (`pdx extract` is the first, on its own) |
| `pdx builder` | Starts the component tester and theme builder |

A `pdx.config.ts` at the project root configures `root`, `routes`, `components`, `prefix`,
`build` (`outDir`, `minify`, `target`), `plugins` and `ssg`. A config
file that exists and cannot be loaded stops the command with the error. It never falls back
silently to the defaults.

## Documentation

[CLI](https://pdxui.com/docs/cli) and [making a theme](https://pdxui.com/docs/making-a-theme).

## License

[MIT](../../licenses/LICENSE-MIT.txt).
