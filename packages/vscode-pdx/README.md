# PDX for VS Code

Language support for `.pdx` files — the single-file components of [PDX](https://pdxui.com), which
the compiler turns into standard Web Components.

## Features

- **Highlighting** for the three blocks of a `.pdx`: the template as HTML with binding values as
  TypeScript, the script as TypeScript with the PDX runes (`@prop`, `$signal`, …), the style as CSS.
- **Diagnostics** from the PDX compiler (`PDX_*` codes, explained on the
  [diagnostics page](https://pdxui.com/docs/diagnostics)), with **quick fixes** where the finding
  carries one.
- **Type-checking** of the script and of every template expression, as TypeScript sees them.
- **Completion**: runes, component tags (the library's and your project's), each component's props
  and events, its named slots inside `slot="…"`.
- **Hover** on runes and components; **go to definition**; **find references**; **rename** across
  files — a component tag in `.pdx`, `.ts` and `.html`, a script symbol where TypeScript says it is
  used. A tag a library defines is not renamed.
- **Outline** of a component's declarations, and **formatting**.

## Settings

| Setting | Default | |
|---|---|---|
| `pdx.typeCheck` | `true` | Report TypeScript errors in the script and the template. Off keeps completion, hover and navigation, without the type squiggles. |

## Requirements

VS Code 1.85 or later. Components are found from the project a file belongs to — the nearest
`package.json` above it — through its dependencies that declare `customElements` (`@pdxui/ui`,
`@pdxui/router`, any other component package), and the `.pdx` files under `src/` and `pages/`.
The type-check uses the project's TypeScript, or the one VS Code ships when the project has none.

The same checks run without an editor: `pdx check` (and `pdx check --types` for the type-check),
for an agent or CI.

## Documentation

- [PDX documentation](https://pdxui.com/docs)
- [Diagnostics](https://pdxui.com/docs/diagnostics) — every `PDX_*` code, what it means, how to fix it
- [Issues](https://github.com/pragmatic-design/pdxui/issues)

## Development

```
npm run package   # builds the language server and the extension, and writes the .vsix (pre-release)
```

To try it without packaging: open this folder in VS Code and press **F5**. The grammar's rune list
is generated from the compiler (`npm run gen-grammar`); the icon from the site's logo
(`npm run render-icon`).
