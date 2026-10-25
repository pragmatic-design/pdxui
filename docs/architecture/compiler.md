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
<script>...</script>   → descriptor.script
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
| `@await (source as name) { ... }` | Await | Async rendering with loading/error states, the result bound to `name` |
| `@require (permission) { ... }` | Require | Conditional rendering driven by permissions |
| `@let name = expr` | Let | A local variable in the template |

The parser tracks the line and column of every node, which is what makes accurate source maps and precise error messages possible.

### Stage 3 — script analysis

**File**: `compiler/script-analyzer.ts` (853 lines) + helpers (588 lines)

Analyses the `<script>` block and extracts every declaration. This stage is the compiler's "brain": it works out what the developer declared and builds a complete model of the component.

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
@fetch users: 'GET /api/users';           // a reactive GET
@fetch user: 'GET /api/users/${id}';      // with a reactive parameter
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

There is one compilation mode (#158): every script is read for its declarations and runes, with or
without `setup`, and every top-level name reaches the template. The pre-rune syntax (`defineProps`,
`defineEmits`, a top-level `return {}`) and `@mixin` are removed forms, reported as
`PDX_REMOVED_FORM` from the registry of language changes (`src/language/legacy-script.ts`).

### Stage 4 — signal rewrite

**Files**: `compiler/signal-rewrite-ast.ts` (the rewrite), `compiler/signal-rewrite.ts` (the declarations)

This stage turns natural JavaScript syntax into calls to the signal API. The point is that the developer writes ordinary code and the compiler generates the reactive version:

```javascript
// The dev writes:             // The compiler generates:
let count = $signal(0);        const __count = signal(0);
count++;                       __count.set(__v => __v + 1);
count--;                       __count.set(__v => __v - 1);
count += 5;                    __count.set(__v => __v + 5);
count = 10;                    __count.setRaw(10);      // an assignment stores its value as it is
console.log(count);            console.log(__count());
```

`rewriteAst` in `signal-rewrite-ast.ts` parses the code with the TypeScript parser and rewrites it in **one walk**. The walk covers:

- **reads**: `count` → `__count()`;
- **updates**: `++`, `--` and the compound operators → `set` with an updater;
- **assignments**: `=`, `||=`, `&&=`, `??=` → `setRaw`, so a function is stored as it is;
- **the signal's own methods**: `count.peek()`, `count.setRaw(v)`;
- **a `$signal` that is called**: `handler(a)` → `__handler()(a)`;
- **callable reads**: a prop, a `$derived` or a typed route param → `total()`; its `total.peek()` is
  left as written, the signal's own method.

The full table, with the self-read that an assignment makes untracked, is in [docs/language/script.md](../language/script.md#the-script-and-its-rewrite). The walk visits:

- the setup body;
- the bodies of `$effect`, `$watch`, `onMount` and `onDestroy`;
- every `$derived` expression;
- every `@provide` value.

Being an AST walk is what makes it correct where a pattern would not be:

- a parameter or a local of the same name shadows the signal and is left alone;
- a property name (`row.count`) and a shorthand property (`{ count }`, which becomes `{ count: __count() }`) are told apart;
- generics, multiline expressions, optional chaining and code inside strings, comments and template literals need no special case.

Mutations add only a prefix and a suffix around the expression. Their right side is rewritten by the same walk, so no two edits overlap.

Two cases leave code as written:

- **`/*@raw*/` lines** (the `@raw` declaration) are protected ranges. The body is still parsed as a whole, so a statement that spans lines parses correctly, but no edit lands inside them. A body with `@raw` that does not parse as a whole is rewritten line by line instead, the raw lines left out.
- **A fragment that does not parse**, or whose edits would overlap, is returned unchanged rather than guessed. The compiler reports `PDX_REWRITE_FALLBACK` with the fragment, because the generated code then reads a signal raw.

`signal-rewrite.ts` emits the declarations: `const __count = signal(…)`, the `computed(…)` of each `$derived` (whose expression goes through `rewriteAst`), and the auto-return object.

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
- **codegen-template-inline.ts**: turns the template AST into imperative DOM code, the one render path (#107)
- **codegen-template.ts**: what the render shares with other generators — transition, virtual-list and `@await` options, a `@defer`'s loader, the hoisting of a scoped slot's function and of a loop's invariant reads (the `html\`\`` generator is removed, #526)
- **codegen-template-rewrite.ts**: event handlers, a two-way accessor, the `dynamic(…)` and `renderSlot(…)` calls
- **codegen-prefix.ts**: adds `ctx.` to the free identifiers in the template (the template reaches the component's scope through the context)
- **codegen-styles.ts**: applies CSS scoping with `[data-pdx-HASH]` and handles `bind()` → `var()`
- **codegen-template-inline.ts**: an alternative production mode that emits imperative DOM instead of `html\`\``

Every value the codegen writes into the generated JavaScript as a string goes through
`compiler/js-literal.ts`: `jsString` for a JSON value, `jsQuote` where the code has always been
single-quoted. Both escape the quotes, the backslash, line breaks, `<`, `>` and U+2028/U+2029, so a
`'` in a `@require` permission or a `</script>` in an attribute stays text. A value pasted between
quotes by hand can leave its string; what is written without either helper is code by intent, such
as a template expression or a name the compiler made itself.

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
| | `text-scan.ts` | 180 | Linear scans of markup and route paths: opening tags, comments, `:params` — in place of patterns that took quadratic time on a malformed file |
| **Parser** | `parser/sfc.ts` | 187 | Splits a .pdx into template/script/style |
| | `parser/template.ts` | 991 | Template HTML → an AST with directives |
| **Analysis** | `compiler/script-analyzer.ts` | 853 | Extracts @prop, $signal, @page, and the rest |
| | `compiler/script-analyzer-helpers.ts` | 588 | Parsing types, form schemas, route params |
| | `compiler/script-analyzer-types.ts` | 194 | The shared TypeScript types |
| **Transformation** | `compiler/signal-rewrite.ts` | 625 | count++ → __count.set() |
| **Generation** | `compiler/codegen.ts` | 646 | The orchestrator: picks the mode, calls the sub-generators |
| | `compiler/codegen-setup.ts` | 342 | Generates the body of setup() |
| | `compiler/codegen-template.ts` | 167 | Options and hoisting the render shares |
| | `compiler/codegen-template-rewrite.ts` | 307 | Event handlers, `dynamic(…)`, `renderSlot(…)` |
| | `compiler/codegen-prefix.ts` | 105 | Adds ctx. to the identifiers |
| | `compiler/codegen-styles.ts` | 200 | CSS scoping with [data-pdx-HASH] |
| | `compiler/codegen-template-inline.ts` | 391 | Imperative DOM generation (prod) |
| **Utilities** | `compiler/validate.ts` | 553 | Cross-checks the template against the script |
| | `compiler/dts-generator.ts` | 114 | Generates .pdx.d.ts |
| | `compiler/tokenizer.ts` | 148 | Navigating strings and comments |
| | `compiler/sourcemap.ts` | 146 | Source Map v3 |
