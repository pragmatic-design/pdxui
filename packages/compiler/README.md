# @pdxui/compiler

Vite plugin that compiles `.pdx` Single File Components into standard Web Components.

## Architecture

```
.pdx file → SFC Parser → Template Parser → Script Analyzer → Signal Rewriter → Code Generator → JS module
                                                                                      ↓
                                                                              DTS Generator → .pdx.d.ts
```

### Reading Order (for new developers)

1. **`src/plugin.ts`** — Entry point. Vite plugin that triggers compilation on `.pdx` files.
2. **`src/parser/sfc.ts`** — Splits `.pdx` into `<template>`, `<script>`, `<style>` blocks.
3. **`src/parser/template.ts`** — Parses template into AST: `@if`, `@for`, `@switch`, `{{ interpolation }}`.
4. **`src/compiler/script-analyzer.ts`** — Analyzes `<script>`: extracts `@prop`, `@event`, `$signal`, auto-expose list.
5. **`src/compiler/signal-rewrite-ast.ts`** — One walk of the script's AST that rewrites writes and reads: `count++` → `__count.set(__v => __v + 1)`. `src/compiler/signal-rewrite.ts` emits the `signal()`/`computed()` declarations and the auto-return.
6. **`src/compiler/codegen.ts`** — Assembles final JS module from all the above: one script grammar (#158), a component or a `@store` module.
7. **`src/compiler/dts-generator.ts`** — Generates `.pdx.d.ts` for IntelliSense.

### The script

Every script is read the same way (#158): declarations and runes.
```
@prop label: string = 'Hello';   → props: { label: prop('Hello', { type: String }) }
let count = $signal(0);          → const __count = signal(0, { name: 'file:count' })
count++;                         → __count.set(__v => __v + 1)
// No return needed              → auto-generated from top-level declarations
```

`defineProps`, `defineEmits`, a top-level `return {}` and `@mixin` are removed forms
(`PDX_REMOVED_FORM`); `pdx migrate` converts the first three.

### Key Transformations

There is one render path, in development and in a build (#107): each block's static markup is built
once and copied, and only what changes is bound, on nodes a walk computed at compile time reaches.

| Source (.pdx) | Compiled (JS) |
|---------------|---------------|
| `{{ expr }}` | `bindInterpolation(textNode, () => ctx.expr())` |
| `@if (cond) { ... }` | `when(() => cond, () => { /* the block's copy */ }, null)` |
| `@for (items as item; track item.id)` | `eachRow(() => ctx.items(), 'id', (item) => …)` |
| `@switch/@case/@default` | `match(() => expr, { "1": () => …, _: () => … })` |
| `@require ('perm')` | `requirePermission('perm', () => …, null)` |
| `@click="handler"` | `el.addEventListener('click', safeHandler(batchHandler(ctx.handler), tag, 'click'))` |
| `::value="signal"` | `bindTwoWay(el, 'value', ctx.signal)` |
| `:prop="expr"` | an effect that assigns `expr` to the property when it changes (`assignBoundProperty`) |
| `<style scoped>` | `@scope ([data-pdx-HASH]) to ([data-pdx-root] > *) { … }` under the default target; a `[data-pdx-HASH]` prefix under `baseline-2024` |
