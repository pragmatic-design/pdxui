# The compiler

## What it is for

The compiler is a Vite plugin that turns `.pdx` files (Single File Components) into JavaScript modules. Each module calls `component()` from `@pdxui/core` to register a Custom Element in the browser.

The compiler is not a plain transpiler. It is a semantic tool: it understands the developer's declarations (`@prop`, `$signal`, `@page`), validates the template against the script, generates optimised code, and produces type definitions for IntelliSense.

## How it works: the pipeline

Compilation happens in 6 sequential stages. Each stage produces the input to the next.

### Stage 1 — SFC parse

**File**: `parser/sfc.ts` (187 lines)

The first stage takes the raw content of the `.pdx` file and splits it into three optional blocks:

```html
<template>...</template>     → descriptor.template
<script setup>...</script>   → descriptor.script
<style scoped>...</style>    → descriptor.style
```

The parser handles a few non-trivial cases: a `</script>` tag can appear inside a JavaScript string (in an example code block, say), so the parser is tokenizer-aware and is not fooled.

Each block can carry attributes: `setup` (on the script), `scoped` (on the style), `src` (for external templates), `lang` (for future preprocessors).

### Stage 2 — template parse

**File**: `parser/template.ts` (991 lines)

Takes the template's HTML and produces an AST (Abstract Syntax Tree). The AST represents not only standard HTML elements but Pragmatic's own directives:

| Syntax | AST node | Meaning |
|----------|----------|-------------|
| `<div>text</div>` | Element, Text | Standard HTML |
| `${expression}` | Interpolation | A reactive expression in the text |
| `${expr \| pipeName}` | PipedInterpolation | An expression with a transformation |
| `@if (cond) { ... }` | Conditional | Conditional rendering |
| `@for (item of items) { ... }` | Loop | Iterating a collection |
| `@switch (val) { @case ... }` | Switch | Pattern matching in the template |
| `@show (cond)` | Show | CSS visibility (display:none, without removing from the DOM) |
| `@portal (selector) { ... }` | Portal | Rendering somewhere else in the DOM |
| `@defer (trigger) { ... }` | Defer | Lazy loading with a trigger (viewport, hover, idle) |
| `@try { ... } @catch { ... }` | ErrorBoundary | Handling errors during rendering |
| `@await (promise) { ... }` | Await | Async rendering with loading/error states |
| `@require (permission) { ... }` | Require | Conditional rendering driven by permissions |
| `@let name = expr` | Let | A local variable in the template |

The parser tracks the line and column of every node, which is what makes accurate source maps and precise error messages possible.

### Stage 3 — script analysis

**File**: `compiler/script-analyzer.ts` (853 lines) + helpers (588 lines)

Analyses the `<script setup>` block and extracts every declaration. This stage is the compiler's "brain": it works out what the developer declared and builds a complete model of the component.

The declarations it recognises:

**Prop** — the component's external properties:
```javascript
@prop label: string = 'Hello';    // name, type, default
@prop count: number;               // no default → undefined
```

**Signal** — internal reactive state:
```javascript
let count = $signal(0);            // a signal with an initial value
let name = $signal('');
```

**Derived** — a computed value that depends on other signals:
```javascript
const doubled = $derived(count * 2);  // recomputed when count changes
```

**Event** — an event the component emits:
```javascript
@event changed: { value: number };  // a name plus a payload type
```

**Routing** — metadata for the router:
```javascript
@page '/users/:id';       // the path (added to the router manifest)
@guard 'admin.users';     // the permission required
@title 'User Profile';    // the page title (<head>)
@meta name: 'description' 'Browse users';  // a meta tag
```

**Data** — declarative data loading:
```javascript
@fetch users: '/api/users';           // a reactive GET
@fetch user: '/api/users/${id}';      // with a reactive parameter
```

**Form** — a form with validation:
```javascript
@form UserDto;                        // an external schema
@form { name: string, email: string } // an inline schema
```

**Store** — global state:
```javascript
@store useTheme from './stores/theme'; // an imported singleton
```

The analyzer also decides the **compilation mode**:
- If it finds `@prop` or `$signal` → **new mode** (recommended, with auto-return)
- If it finds `defineProps` or `return {}` → **legacy mode** (backward compatibility)

The two modes cannot be mixed in one file.

### Stage 4 — signal rewrite

**File**: `compiler/signal-rewrite.ts` (625 lines)

This stage turns natural JavaScript syntax into calls to the signal API. The point is that the developer writes ordinary code and the compiler generates the reactive version:

```javascript
// The dev writes:             // The compiler generates:
let count = $signal(0);        const __count = signal(0);
count++;                       __count.set(v => v + 1);
count--;                       __count.set(v => v - 1);
count += 5;                    __count.set(v => v + 5);
count = 10;                    __count.set(10);
console.log(count);            console.log(__count());
```

The rewrite uses ordered regexes, not an AST parser. That is a deliberate choice: regexes are 10x faster than an AST walk, and JS mutation patterns are finite and predictable. The order of the 6 regexes is **critical**, because a more general pattern would match before a specific one:

1. `count++` / `++count` → increment (first, or a bare `count` would match)
2. `count--` / `--count` → decrement
3. `count += expr` → compound assignment (before `=`, or `+=` would match `=`)
4. `count = expr` → simple assignment
5. `count` (read) → a getter call (LAST — after every mutation has been rewritten)

The rewriter is "string-safe": it recognises strings, comments and template literals, so it does not rewrite occurrences inside code that never runs.

### Stage 5 — code generation

**File**: `compiler/codegen.ts` (646 lines) + 6 specialised modules (~1700 lines)

The code generator takes the template's AST, the script analysis and the rewritten code, and produces the final JavaScript module. The result is always a call to `component()`:

```javascript
import { component, html, signal, useHead } from '@pdxui/core';

component('pdx-counter', {
    props: {
        label: { type: String, default: 'Hello' },
    },
    setup(ctx) {
        useHead({ title: 'Counter Example' });
        const __count = signal(0);
        function increment() { __count.set(v => v + 1); }
        return { count: __count, increment };
    },
    render: (ctx) => html`
        <div class="counter">
            <button @click="${ctx.increment}">Count: ${ctx.count}</button>
        </div>
    `,
});
```

The codegen's sub-modules each own one responsibility:

- **codegen-setup.ts**: builds the body of `setup()` — prop accessors, signals, lifecycle hooks, CSS scoping
- **codegen-template.ts**: turns the AST into an `html\`\`` tagged template
- **codegen-template-rewrite.ts**: rewrites the special attributes (`:prop` → a property binding, `@event` → an event listener)
- **codegen-prefix.ts**: adds `ctx.` to the free identifiers in the template (the template reaches the component's scope through the context)
- **codegen-styles.ts**: applies CSS scoping with `[data-pdx-HASH]` and handles `bind()` → `var()`
- **codegen-template-inline.ts**: an alternative production mode that emits imperative DOM instead of `html\`\``

### Stage 6 — DTS generation

**File**: `compiler/dts-generator.ts` (114 lines)

Generates a `.pdx.d.ts` file to give the IDE IntelliSense. The generated type includes:

- An interface for the component's props
- The type of the events it emits
- The signatures of the available slots
- An entry in the `HTMLElementTagNameMap` (so the browser knows the element's type)

## After compilation: the Vite plugin

Compilation produces the JS, but the Vite plugin (`plugin.ts`, 560 lines) adds three crucial post-compilation steps:

### Component auto-import

When a template contains a `<pdx-rating>` tag, the developer does not have to write `import '@pdxui/ui/rating'` — the plugin does it. That happens through the **ComponentResolver**.

The ComponentResolver builds a `tag → import path` map from two sources:

1. **@pdxui/ui**: it reads the `exports` field of the UI package's `package.json`. Every sub-path export such as `"./rating"` produces a mapping: the tag `pdx-rating` → `import '@pdxui/ui/rating'`.

2. **The project's own .pdx files**: it scans the project directories. A `user-card.pdx` file produces the tag `pdx-user-card` → a relative import.

That map is built when the dev server starts (`buildStart`). Adding a new component to the UI package means restarting Vite with `--force` to regenerate it.

**Careful**: if a component has no export in `package.json`, the auto-import does not happen. The tag stays an unknown element, the Custom Element is never registered, and the element renders empty — **with nothing at all in the console**. This is the framework's most treacherous failure, and the reason registration is a documented 3-step procedure.

### Store auto-import

The same logic: if the compiled code contains `useTheme()` and the store registry knows `useTheme`, the plugin injects the import.

### HMR (Hot Module Replacement)

In dev mode the plugin adds code that saves and restores signal state when the file changes. The element is not destroyed and recreated — its prototype is updated and the state survives.

## Validation

**File**: `compiler/validate.ts` (553 lines)

Before producing its final output, the compiler runs a series of consistency checks between the template and the script:

- **Unused exports**: a function the script exposes and the template never references
- **Non-reactive variables in a binding**: using a `let` variable (not a signal) in a `:prop` binding produces stale data
- **Duplicate events**: two `@event`s with the same name
- **Missing types**: props with no explicit type
- **Empty loops**: a `@for` with no body
- **Accessibility hints**: images with no alt, buttons with no text or aria-label

Every warning carries a code, a severity, a readable message, and optionally a proposed automatic fix.

## The file map

To find your way around the compiler's source:

| Area | File | Lines | What it does |
|------|------|-------|---------|
| **Vite plugin** | `plugin.ts` | 560 | The Vite hooks: config, transform, HMR, the virtual router |
| | `component-resolver.ts` | 180 | The tag→import map, from package.json and .pdx files |
| | `plugin-utils.ts` | 380 | Alias discovery, store/route scanning, auto-import injection |
| | `plugin-system.ts` | 60 | The hook interface for external plugins |
| **Parser** | `parser/sfc.ts` | 187 | Splits a .pdx into template/script/style |
| | `parser/template.ts` | 991 | Template HTML → an AST with directives |
| **Analysis** | `compiler/script-analyzer.ts` | 853 | Extracts @prop, $signal, @page, and the rest |
| | `compiler/script-analyzer-helpers.ts` | 588 | Parsing types, form schemas, route params |
| | `compiler/script-analyzer-types.ts` | 194 | The shared TypeScript types |
| **Transformation** | `compiler/signal-rewrite.ts` | 625 | count++ → __count.set() |
| **Generation** | `compiler/codegen.ts` | 646 | The orchestrator: picks the mode, calls the sub-generators |
| | `compiler/codegen-setup.ts` | 342 | Generates the body of setup() |
| | `compiler/codegen-template.ts` | 343 | AST → an html\`\` tagged template |
| | `compiler/codegen-template-rewrite.ts` | 302 | :prop/@event → JS bindings |
| | `compiler/codegen-prefix.ts` | 105 | Adds ctx. to the identifiers |
| | `compiler/codegen-styles.ts` | 200 | CSS scoping with [data-pdx-HASH] |
| | `compiler/codegen-template-inline.ts` | 391 | Imperative DOM generation (prod) |
| **Utilities** | `compiler/validate.ts` | 553 | Cross-checks the template against the script |
| | `compiler/dts-generator.ts` | 114 | Generates .pdx.d.ts |
| | `compiler/tokenizer.ts` | 148 | Navigating strings and comments |
| | `compiler/sourcemap.ts` | 146 | Source Map v3 |
