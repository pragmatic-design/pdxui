# UI components (@pdxui/ui)

## What it is

`@pdxui/ui` is the framework's library of ready-made components. It holds over 50 Web Components (buttons, dialogs, rating, segmented control, data table, ...) built on `@pdxui/core` and styled with `@pdxui/design`.

Every component is a standard Custom Element: `<pdx-button>`, `<pdx-dialog>`, `<pdx-rating>`. They work in any HTML context, not only inside Pragmatic apps.

## How a component works

Every component is a single TypeScript file that calls `component()` from core:

```typescript
// packages/ui/src/switch-toggle/pdx-switch.ts
import { component, html } from '@pdxui/core';

component('pdx-switch', {
    props: {
        checked:  { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        label:    { type: String,  default: '' },
        size:     { type: String,  default: '' },
    },
    setup(ctx) {
        function onChange(e: Event) {
            if (ctx.disabled()) return;
            ctx.emit('pdx-change', { checked: (e.target as HTMLInputElement).checked });
        }

        function toggleClass(): string {
            let cls = 'pdx-toggle';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-toggle-' + s;
            return cls;
        }

        return { onChange, toggleClass };
    },
    render: (ctx) => html`
        <label class="pdx-switch-wrap">
            <input type="checkbox" :class="${ctx.toggleClass}" role="switch"
                   :checked="${ctx.checked}" @change="${ctx.onChange}" />
            <span class="pdx-switch-label">${ctx.label}</span>
        </label>
    `,
});
```

The shape is always the same:
- **props**: the external properties, each with a type and a default
- **setup(ctx)**: the component's logic — functions, computeds, effects. It returns what the template needs.
- **render(ctx)**: the HTML template, with reactive bindings

## Creating a new component

Creating a component takes a precise set of steps. Each one is necessary — skipping one produces silent failures (empty elements, with nothing in the console).

### Step 1 — the component's file

Create the file at `packages/ui/src/{name}/pdx-{name}.ts`.

The naming convention is strict: the directory and the file must share the same name, prefixed with `pdx-`. That name becomes the Custom Element's HTML tag.

### Step 2 — register the component with the system

This is the step that causes 90% of the trouble when it is forgotten. It takes three actions:

**A) Add the export to package.json**

In `packages/ui/package.json`, add to the `exports` section:

```json
"./{name}": {
    "import": "./src/{name}/pdx-{name}.ts"
}
```

That export is what the compiler's ComponentResolver reads in order to build its auto-import map. Without it, when a `.pdx` file contains `<pdx-{name}>` the compiler does not know where to find the component and emits no import. The Custom Element is never registered, and the element in the DOM stays empty.

**B) Add the side-effect import to index.ts**

In `packages/ui/src/index.ts`, add:

```typescript
import './{name}/pdx-{name}';
```

This is what serves the contexts where the whole library is pulled in with `import '@pdxui/ui'`.

**C) Restart the dev server**

```bash
npx vite --port 5210 --force
```

The `--force` is necessary because the ComponentResolver builds its map at startup. Without a restart, the new export is never seen.

### Step 3 — the CSS

The styles go in `packages/design/src/components/{name}.css` (for standalone components) or in `packages/design/src/surfaces/forms.css` (for form elements such as input, switch, checkbox).

**Before choosing the CSS class name**, check that it is not already taken:

```bash
grep -r "\.pdx-{name}" packages/design/
```

CSS name collisions are insidious: one component can inherit another's styles — as happened with `.pdx-toggle`, used both for the switch and for the toggle button, which produced spurious white dots.

The CSS file is imported from `packages/design/src/components/_all.css`:

```css
@import "./{name}.css";
```

### Step 4 — the showcase demo

Every component has a demo page in the showcase. The file goes in `packages/compiler/demo/showcase-new/pages/comp-{name}.pdx`.

The demo's structure **has to follow the pattern of the existing pages** (`comp-switch.pdx`, for instance). Do not invent a custom layout — visual consistency is part of the design system's quality.

The base structure:

```html
<template>
  <div class="page">
    <h1 class="pdx-txt-title">Component Name</h1>
    <p class="pdx-txt-body pdx-ink-muted intro">
      <code>&lt;pdx-{name}&gt;</code> — a short description.
    </p>

    <section>
      <h2 class="pdx-txt-heading section-heading">Demo Section</h2>
      <p class="pdx-txt-small pdx-ink-muted">An explanation.</p>
      <div class="demo-row">
        <pdx-{name} prop="value"></pdx-{name}>
      </div>
    </section>

    <section>
      <h2 class="pdx-txt-heading section-heading">Reference</h2>
      <div class="options-table">
        <div class="opt-header"><span>Prop</span><span>Type</span><span>Description</span></div>
        <div class="opt-row"><code>prop</code><span>string</span><span>Description</span></div>
      </div>
    </section>
  </div>
</template>

<script setup>
@page '/components/{name}';
@title 'Component Name';
</script>

<style scoped>
  .page { max-width: 760px; }
  .intro { margin-bottom: var(--pdx-space-xl); }
  section { margin-bottom: var(--pdx-space-3xl); }
  /* ... copy the remaining styles from comp-switch.pdx */
</style>
```

Each demo section is its own component, and the page composes them. A section of `pages/comp-{name}.pdx` lives in `pages/sections/comp-{name}/demo-comp-{name}-{slug}.pdx`, holds the whole `<section>` (heading, demo, source block) and the styles only it uses, and the page places it with a class:

```html
<pdx-demo-comp-{name}-basic class="demo-section"></pdx-demo-comp-{name}-basic>
```

The Reference table can stay inline. State that more than one section reads — the button page's event console, for instance — goes in `sections/comp-{name}/state.pdx.ts` as a `@store`, which each section imports (`import { useButtonConsole } from './state.pdx'`); data several sections show goes in the same module as an exported constant (`export const teamItems = […]`). A page that needs both puts the data in `sections/comp-{name}/data.pdx.ts`: a `@store` module cannot also export. A section that owns its state keeps it in its own script. `packages/compiler/tests/showcase-warnings.test.ts` holds the pages not yet migrated: a new page is written in this form from the start, and a migrated page leaves that list.

The layouts available to a demo:
- **demo-row**: a horizontal flex (buttons, toggles, badges side by side)
- **demo-stack**: a vertical flex (switches, form-fields stacked)
- **demo-block**: a plain block (fieldsets, wide cards)
- **source-block**: collapsible source code
- **options-table**: the props reference table

### Step 5 — the sidebar link

Add the link to the page in `app.pdx`, in the right section of the sidebar.

## Development patterns

### A declarative render

The render has to be declarative — only `html\`\`` with bindings. Never logic in the render:

```typescript
// Right
render: (ctx) => html`
    <button :class="${ctx.btnClass}" @click="${ctx.onClick}">
        <slot></slot>
    </button>
`,

// Wrong (logic in the render — put it in setup)
render: (ctx) => {
    if (ctx.variant() === 'fancy') return html`...`;
    return html`...`;
}
```

### Internal state through signals

When a component has internal state (not exposed as a prop), use `signal()` from core:

```typescript
import { component, html, signal } from '@pdxui/core';

component('pdx-accordion', {
    setup(ctx) {
        const isOpen = signal(false);
        function toggle() { isOpen.set(v => !v); }
        return { isOpen, toggle };
    },
    render: (ctx) => html`...`,
});
```

### Imperative DOM work

When the DOM has to be changed in a way a declarative template cannot express (measuring sizes, positioning elements), use the `requestAnimationFrame` pattern:

```typescript
setup(ctx) {
    let containerEl: HTMLElement | null = null;

    ctx.track(() => {
        // First: read the signals (so the effect re-runs when they change)
        const legendText = ctx.legend() as string;
        const isCollapsed = ctx.collapsed();

        // Then: work on the DOM in the next frame
        // (by which point the template will have rendered)
        requestAnimationFrame(() => {
            if (!containerEl) {
                containerEl = ctx.el.querySelector('.container');
            }
            if (containerEl) {
                containerEl.textContent = legendText;
            }
        });
    });
}
```

### Child Custom Elements in a flex layout

When a wrapper component (a toggle-group, say) contains child CEs that have to take part in the flex layout:

```css
/* The wrapper CE is an inline-flex container */
.pdx-toggle-group {
    display: inline-flex;
}

/* The child CEs have to be transparent to the layout */
.pdx-toggle-group > pdx-toggle {
    display: contents;
}
```

Without `display: contents` the child CE defaults to `display: block` and breaks the flex layout. With it, the CE's box is eliminated and its content (the inner button) takes part in the parent's flex directly.

### Form integration

A custom form component has to include an `<input type="hidden">` in order to take part in native form submission:

```typescript
render: (ctx) => html`
    <div class="pdx-rating">
        <!-- the rating's visual UI -->
        ${() => ctx.name() ? html`
            <input type="hidden" :name="${ctx.name}" :value="${() => String(ctx.value())}" />
        ` : ''}
    </div>
`,
```

### Events

Components emit a CustomEvent through `ctx.emit()`:

```typescript
ctx.emit('change', { value: newValue, previousValue: oldValue });
```

Whoever uses the component can listen with `@change="handler"` in a `.pdx` file, or with `addEventListener('change', ...)` in JavaScript.

## Common mistakes, and how to avoid them

### An empty element, and nothing in the console

**Cause**: the component is not registered, because the export is missing from `@pdxui/ui`'s `package.json`. The compiler generates no auto-import, the Custom Element is never defined, and the HTML tag stays an unknown element — which the browser renders empty, without an error.

**Prevention**: follow all 3 registration steps. When in doubt, check in the browser:
```javascript
customElements.get('pdx-name')  // it must return the class, not undefined
```

### Another component's styles "bleeding" into the new one

**Cause**: a CSS class name collision. Two different components use the same class (`.pdx-toggle`, say), and the styles overlap.

**Prevention**: always `grep` for the name before choosing it. If it is taken, add a suffix (`.pdx-toggle-btn`, to tell it apart from the toggle switch).

### ctx.track() that does not react to changes

**Cause**: the function inside `ctx.track()` returns before reading any signal — typically because a DOM query returns `null` on the first run and there is an early `return`. The effect has no dependencies and will never re-run.

**Prevention**: ALWAYS read the signals before doing anything else. DOM queries belong inside `requestAnimationFrame()`.

### A doubled visual style on the active state

**Cause**: both the CSS (through a selector like `[aria-checked="true"]`) and the JavaScript (through a dynamic indicator) style the same state. The two overlap visually.

**Prevention**: pick one approach. Prefer plain CSS with ARIA selectors where possible — it is simpler and faster.

### CSS that does not match the component's ARIA attributes

**Cause**: the CSS was written with selectors like `[aria-selected="true"]` while the component sets `[aria-checked="true"]` (or the reverse). The active state gets no styling.

**Prevention**: write the component and its CSS together, checking that the CSS selectors match exactly the ARIA attributes the JavaScript sets.
