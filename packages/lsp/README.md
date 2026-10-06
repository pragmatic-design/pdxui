# @pdxui/lsp

A Language Server Protocol implementation for `.pdx` files. It provides completion, hover,
diagnostics, go-to-definition, references, rename, symbols, code actions and formatting, across the
template, the script and the declarations (`@prop`, `@page`, `$signal`, …). Its diagnostics are the
ones `pdx check` reports, plus TypeScript's own.

The VS Code extension (`packages/vscode-pdx`) bundles it. Any other editor with LSP support can run
it:

```bash
pnpm add -D @pdxui/lsp
npx pdx-lsp --stdio
```

It needs `@pdxui/compiler` installed next to it.

## License

[MIT](../../licenses/LICENSE-MIT.txt).
