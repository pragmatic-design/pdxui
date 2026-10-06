# Compiler Plugin System

Extend the PDX compiler with custom transformations, directives, and type generation.

## Quick Start

```typescript
// vite.config.ts
import { pdx } from '@pdxui/compiler';
import { analyticsPlugin } from './plugins/analytics';

export default defineConfig({
    plugins: [pdx({ plugins: [analyticsPlugin] })],
});
```

## Plugin Interface

```typescript
interface CompilerPlugin {
    name: string;
    transformScript?(script: string, ctx: PluginContext): string;
    analyzeScript?(analysis: ScriptAnalysis, ctx: PluginContext): void;
    transformOutput?(code: string, ctx: PluginContext): string;
    generateTypes?(analysis: ScriptAnalysis, ctx: PluginContext): string;
    templateDirectives?: Record<string, TemplateDirectiveHandler>;
}
```

```typescript
interface TemplateDirectiveHandler {
    generate(expr: string, bodyCode: string, imports: Set<string>): string;
}
```

## Hook Lifecycle

```
.pdx source
  │
  ├─ 1. transformScript(script, ctx)     ← modify raw script before analysis
  │
  ├─ 2. analyzeScript(analysis, ctx)     ← read/augment script analysis
  │
  ├─ 3. [template parsing + codegen]
  │
  ├─ 4. transformOutput(code, ctx)       ← modify final JS output
  │
  └─ 5. generateTypes(analysis, ctx)     ← add .d.ts declarations
```

Hooks execute in **plugin registration order**. Each plugin sees the output of previous plugins.

## PluginContext API

| Method | Description |
|--------|-------------|
| `ctx.filename` | Source file path being compiled |
| `ctx.tag` | Component CE tag name (`pdx-counter`) |
| `ctx.addImport(name)` | Add to `@pdxui/core` import |
| `ctx.addSetupCode(code)` | Inject code into `setup()` body |
| `ctx.addUserImport(stmt)` | Add a custom import statement |
| `ctx.warn(message)` | Emit a compiler warning |

## Hook Details

### 1. transformScript

Modify raw script content before the analyzer runs.

```typescript
transformScript(script, ctx) {
    // Replace custom macro with real code
    return script.replace(/@log\b/g, 'console.log');
}
```

### 2. analyzeScript

Read or augment the script analysis. Access props, signals, events, route info.

```typescript
analyzeScript(analysis, ctx) {
    if (analysis.route.page) {
        ctx.addSetupCode(`__track('${analysis.route.page}')`);
        ctx.addUserImport("import { __track } from './analytics'");
    }
}
```

### 3. transformOutput

Modify the final generated JavaScript.

```typescript
transformOutput(code, ctx) {
    // Wrap component in performance monitoring
    return code.replace(
        `component('${ctx.tag}'`,
        `/* instrumented */ component('${ctx.tag}'`
    );
}
```

### 4. generateTypes

Add TypeScript declarations to the `.pdx.d.ts` file.

```typescript
generateTypes(analysis, ctx) {
    return `export interface ${ctx.tag}Analytics { pageView: string; }`;
}
```

### Template Directives

Plugins can register custom template directives via the `templateDirectives` property. It's a `Record<string, TemplateDirectiveHandler>` — the compiler auto-parses `@directiveName (expr) { body }` blocks and calls your `generate()` with the expression, generated body code, and the imports set.

```typescript
templateDirectives: {
    analytics: {
        generate(expr, bodyCode, imports) {
            imports.add('trackSection');
            return `trackSection(${JSON.stringify(expr)}, () => ${bodyCode})`;
        },
    },
},
```

The parser handles block structure automatically. Your `generate()` receives:
- `expr` — the expression string from `@analytics (expr) { ... }`
- `bodyCode` — the already-compiled JS for the body content
- `imports` — `Set<string>` to add runtime imports your directive needs

For simpler transformations, `transformScript` (pre-parse) and `transformOutput` (post-codegen) can also be used.

## Example: Analytics Plugin

```typescript
// plugins/analytics.ts
import type { CompilerPlugin } from '@pdxui/compiler';

export const analyticsPlugin: CompilerPlugin = {
    name: 'pragmatic-analytics',

    analyzeScript(analysis, ctx) {
        // Auto-track page views for routed components
        if (analysis.route.page) {
            ctx.addSetupCode(`__pdx_trackPageView('${analysis.route.page}')`);
            ctx.addUserImport("import { __pdx_trackPageView } from '@app/analytics'");
        }
    },

    transformOutput(code, ctx) {
        // Add data-analytics attribute to component registration
        return code.replace(
            `component('${ctx.tag}',`,
            `component('${ctx.tag}', /* analytics:${ctx.tag} */`
        );
    },
};
```

Usage in `vite.config.ts`:
```typescript
import { pdx } from '@pdxui/compiler';
import { analyticsPlugin } from './plugins/analytics';

export default defineConfig({
    plugins: [pdx({ plugins: [analyticsPlugin] })],
});
```

## Testing Plugins

```typescript
import { compile } from '@pdxui/compiler';
import { analyticsPlugin } from './analytics';

it('injects page tracking', () => {
    const source = `
<template><div>Dashboard</div></template>
<script setup>
@page '/dashboard';
</script>`;

    const { code } = compile(source, 'dashboard.pdx', [analyticsPlugin]);
    expect(code).toContain('__pdx_trackPageView');
    expect(code).toContain("'/dashboard'");
});
```
