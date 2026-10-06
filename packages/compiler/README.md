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
2. **`src/parser/sfc.ts`** — Splits `.pdx` into `<template>`, `<script setup>`, `<style>` blocks.
3. **`src/parser/template.ts`** — Parses template into AST: `@if`, `@for`, `@switch`, `{{ interpolation }}`.
4. **`src/compiler/script-analyzer.ts`** — Analyzes `<script setup>`: extracts `@prop`, `@event`, `$signal`, auto-expose list.
5. **`src/compiler/signal-rewrite.ts`** — Transforms `count++` → `__count.set(v => v + 1)` in function bodies.
6. **`src/compiler/codegen.ts`** — Assembles final JS module from all the above. Two modes: new (decorator+rune) and legacy (defineProps).
7. **`src/compiler/dts-generator.ts`** — Generates `.pdx.d.ts` for IntelliSense.

### Two Compilation Modes

**New mode** (decorator + rune): detected by `@prop` or `$signal` in script.
```
@prop label: string = 'Hello';   → props: { label: { type: String, default: 'Hello' } }
let count = $signal(0);          → const __count = signal(0, { name: 'file:count' })
count++;                         → __count.set(v => v + 1)
// No return needed              → auto-generated from top-level declarations
```

**Legacy mode**: detected by `defineProps` or explicit `return`.
```
const props = defineProps({ label: { type: String } });
const count = signal(0);
return { count };
```

### Key Transformations

| Source (.pdx) | Compiled (JS) |
|---------------|---------------|
| `{{ expr }}` | `${() => expr}` or `${ctx.expr}` |
| `@if (cond) { ... }` | `when(() => cond, () => html\`...\`)` |
| `@for (items as item; track item.id)` | `each(() => items, 'id', (item) => ...)` |
| `@switch/@case/@default` | `match(() => expr, { case: ... })` |
| `@require ('perm')` | `requirePermission('perm', ...)` |
| `@click="handler"` | `@click=\${ctx.handler}` |
| `::value="signal"` | `::value=\${ctx.signal}` |
| `:prop="expr"` | `:prop=\${() => ctx.expr}` |
| `<style scoped>` | CSS with `[data-pdx-HASH]` attribute scoping |
