---
title: Use anywhere (CDN & frameworks)
description: "From a single <script> tag to enterprise: progressive usage, no-build CDN, framework interop."
order: 16
---

# Use anywhere

PDX doesn't force a setup on you. It scales from a single `<script>` tag dropped into an existing page
to a full enterprise build. You pick the level that fits.

## Progressive levels

| Level | For | How |
| --- | --- | --- |
| **1** | A page, a prototype | `<script src="…pragmatic-core.iife.js">` → zero build |
| **2** | A small project | `npm i @pdxui/framework` → everything included |
| **3** | A medium app | `npm i @pdxui/core @pdxui/router` → cherry-pick |
| **4** | Enterprise | sub-path imports, tree-shaking, the `pdx` CLI, .NET source generation |

The rest of these docs assume the compiler (`.pdx` files). This page is about the **no-compiler** and
**interop** paths.

## Level 1 — drop-in, no build (like jQuery)

Include the runtime from a CDN and you get a global `Pragmatic`. No bundler, no build step — you
define components by hand with the runtime API (the same API the compiler targets).

```html
<script src="https://unpkg.com/@pdxui/core"></script>

<my-counter start="3"></my-counter>

<script>
  const { component, html, signal } = Pragmatic;

  component('my-counter', {
    props: { start: { type: Number, default: 0 } },
    setup(ctx) {
      const count = signal(ctx.start());
      return { count, inc: () => count.set(v => v + 1) };
    },
    render: (ctx) => html`
      <button @click=${ctx.inc}>Clicked ${ctx.count} times</button>
    `,
  });
</script>
```

That registers a real custom element `<my-counter>` you can use anywhere on the page.

**The trade-off, honestly:** without the compiler you don't get the sugar. You write the runtime API
explicitly — `signal()` instead of `$signal`, `count.set(v => v + 1)` instead of `count++`,
`ctx.start()` instead of reading `start` directly. It's more verbose, but it's zero-setup and fully
standard. Move up to Level 2+ (the `.pdx` compiler) when you want the declarative sugar and the
production optimizations.

## Prebuilt components from a CDN

The `<pdx-*>` component library ships as ES modules. Pull it in as a module and the custom elements
register themselves — then use them as plain HTML:

```html
<script type="module">
  import 'https://unpkg.com/@pdxui/ui';
  import 'https://unpkg.com/@pdxui/design';   // the CSS (tokens + themes)
</script>

<pdx-button variant="primary">Click me</pdx-button>
<pdx-badge value="5"></pdx-badge>
```

No build needed for the components either — they're standard custom elements.

## In any framework (Angular, React, Vue)

Because the output is **standard Web Components**, a `<pdx-*>` element works in any framework's
templates with no adapter:

```html
<!-- Angular / Vue templates -->
<pdx-button variant="primary" (pdx-click)="save()">Save</pdx-button>
```

```jsx
// React
<pdx-button variant="primary" ref={btn}>Save</pdx-button>
```

A few framework-specific notes apply. React (≤18) stringifies object and array props onto
attributes and does not wire hyphenated events, so both go through a `ref`; Vue needs
`isCustomElement` in its Vite config, and takes object props with `:prop.prop`; Angular needs
`CUSTOM_ELEMENTS_SCHEMA`.

**See it running.** The [Integration](/integrations) page embeds three real apps — React, Vue 3 and
Angular — each installing `@pdxui/*` from a registry the way an external consumer does, and each
wiring the same four components: `pdx-button`, `pdx-select` (object `options` plus the `pdx-change`
event), `pdx-data-grid` (`columns` + `data`), and `pdx-dialog` opened through its imperative
`.show()`. The sources live in `integrations/{react,vue,angular}` and the page shows the wiring code
beside each demo.

> **Not there yet.** Typed wrappers (per-framework packages with prop and event typings) and SSR
> notes are still to come. The foundation is in place — every component ships a Custom Elements
> Manifest, which is what generates those wrappers — but today the integration is the plain custom
> element plus the few lines of glue shown above.
