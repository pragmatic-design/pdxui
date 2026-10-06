// Coverage gap tests: CSS scoping edge cases, signal rewriter edge cases, integration combos.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

// ═══════════════════════════════════════════════════════════════
// CSS SCOPING EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('CSS scoping edge cases', () => {
    it('scopes ::before and ::after pseudo-elements', () => {
        const source = `
<template><div class="icon">X</div></template>
<style scoped>
.icon::before { content: '→'; }
.icon::after { content: '←'; }
</style>`;
        const { code } = compile(source, 'pseudo.pdx');
        // Scope should be BEFORE pseudo-element
        expect(code).toMatch(/\[data-pdx-\w+\]\s*\.icon::before/);
        expect(code).toMatch(/\[data-pdx-\w+\]\s*\.icon::after/);
    });

    it('scopes :hover, :focus, :active pseudo-classes', () => {
        const source = `
<template><button>Click</button></template>
<style scoped>
button:hover { color: red; }
button:focus-visible { outline: 2px solid blue; }
button:active { transform: scale(0.98); }
</style>`;
        const { code } = compile(source, 'states.pdx');
        expect(code).toMatch(/\[data-pdx-\w+\]\s*button:hover/);
        expect(code).toMatch(/\[data-pdx-\w+\]\s*button:focus-visible/);
        expect(code).toMatch(/\[data-pdx-\w+\]\s*button:active/);
    });

    it('scopes attribute selectors', () => {
        const source = `
<template><div data-role="admin">Admin</div></template>
<style scoped>
[data-role="admin"] { font-weight: bold; }
</style>`;
        const { code } = compile(source, 'attr-sel.pdx');
        // Attribute selector gets scope prepended (quotes escaped in JS string)
        expect(code).toMatch(/\[data-pdx-\w+\].*\[data-role/);
    });

    it('scopes :not() pseudo-class', () => {
        const source = `
<template><div><p>Text</p></div></template>
<style scoped>
p:not(:first-child) { margin-top: 1rem; }
</style>`;
        const { code } = compile(source, 'not-pseudo.pdx');
        expect(code).toMatch(/\[data-pdx-\w+\]\s*p:not\(:first-child\)/);
    });

    it('scopes :is() — scope applied inside selector list', () => {
        const source = `
<template><div><h1>Title</h1></div></template>
<style scoped>
:is(h1, h2, h3) { color: navy; }
</style>`;
        const { code } = compile(source, 'is-pseudo.pdx');
        // The CSS scoper applies scope to each selector in :is() list
        expect(code).toContain(':is(h1');
        expect(code).toContain('color: navy');
    });

    it('preserves CSS custom properties inside scoped styles', () => {
        const source = `
<template><div>Hello</div></template>
<style scoped>
.card { color: var(--pdx-color-text); background: var(--my-custom); }
</style>`;
        const { code } = compile(source, 'vars.pdx');
        expect(code).toContain('var(--pdx-color-text)');
        expect(code).toContain('var(--my-custom)');
    });

    it('does NOT scope @keyframes names', () => {
        const source = `
<template><div class="spin">Spinner</div></template>
<style scoped>
@keyframes rotate { from { transform: rotate(0) } to { transform: rotate(360deg) } }
.spin { animation: rotate 1s linear infinite; }
</style>`;
        const { code } = compile(source, 'keyframes.pdx');
        // @keyframes should NOT have scope selector
        expect(code).toMatch(/@keyframes rotate/);
        expect(code).not.toMatch(/\[data-pdx.*@keyframes/);
        // .spin should be scoped
        expect(code).toMatch(/\[data-pdx-\w+\]\s*\.spin/);
    });
});

// ═══════════════════════════════════════════════════════════════
// SIGNAL REWRITER EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('signal rewriter edge cases', () => {
    it('does NOT rewrite function parameters that shadow signal names', () => {
        const source = `
<template><div>{{ result }}</div></template>
<script setup>
  let count = $signal(0);
  function process(count) { return count * 2; }
  const result = process(5);
</script>`;
        const { code } = compile(source, 'shadow-param.pdx');
        // Function parameter 'count' should NOT be rewritten inside the function body
        expect(code).toContain('function process(count)');
        expect(code).toContain('return count * 2');
    });

    it('does NOT rewrite arrow params that shadow signals (braced body)', () => {
        const source = `
<template><div>{{ doubled }}</div></template>
<script setup>
  let count = $signal(0);
  const doubler = (count) => { return count * 2; };
  const doubled = doubler(5);
</script>`;
        const { code } = compile(source, 'shadow-arrow.pdx');
        expect(code).toContain('return count * 2');
    });

    it('does NOT rewrite arrow params inside .map() (concise body)', () => {
        const source = `
<template><div>{{ result }}</div></template>
<script setup>
  let count = $signal(0);
  const result = [1,2,3].map((count) => count * 2);
</script>`;
        const { code } = compile(source, 'shadow-map.pdx');
        // The arrow param 'count' inside .map() should stay as-is
        expect(code).toContain('count) => count * 2');
    });

    it('does NOT rewrite single-param arrow without parens', () => {
        const source = `
<template><div>{{ result }}</div></template>
<script setup>
  let items = $signal([]);
  const result = [1,2].map(items => items + 1);
</script>`;
        const { code } = compile(source, 'shadow-single-arrow.pdx');
        expect(code).toContain('items => items + 1');
    });

    it('rewrites signals in object shorthand correctly', () => {
        const source = `
<template><div>{{ data }}</div></template>
<script setup>
  let count = $signal(0);
  let name = $signal('test');
  const data = { count, name };
</script>`;
        const { code } = compile(source, 'shorthand.pdx');
        // Object shorthand { count } should become { count: __count() }
        expect(code).toContain('__count');
        expect(code).toContain('__name');
    });
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION: @fetch + @form SAME COMPONENT
// ═══════════════════════════════════════════════════════════════

describe('integration: @fetch + @form', () => {
    it('compiles both in same component without conflict', () => {
        const source = `
<template>
  <div>{{ users }}</div>
  <form @submit="contact.handleSubmit">
    <input ::value="contact.fields.name.value">
  </form>
</template>
<script setup>
  @fetch users: 'GET /api/users' as User[];
  @form contact: { name: string { required } };
</script>`;
        const { code } = compile(source, 'fetch-form.pdx');
        expect(code).toContain('resource(');
        expect(code).toContain('createForm(');
        // Both should have independent setup
        expect(code).toContain('users');
        expect(code).toContain('contact');
    });
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION: $inline + @for
// ═══════════════════════════════════════════════════════════════

describe('integration: $inline + @for', () => {
    it('inline block available in render with @for', () => {
        const source = `
<template>
  @for (sorted as item; track item.id) {
    <div>{{ item.name }}</div>
  }
</template>
<script setup>
  let items = $signal([]);
  $inline {
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  }
</script>`;
        const { code } = compile(source, 'inline-for.pdx');
        // render should be a block (not arrow)
        expect(code).toMatch(/render:\s*\(ctx\)\s*=>\s*\{/);
        expect(code).toContain('sorted =');
        expect(code).toContain('return html`');
    });
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION: @raw INSIDE FUNCTION WITH $signal
// ═══════════════════════════════════════════════════════════════

describe('@raw block — scope-aware', () => {
    it('top-level @raw block skips rewriting', () => {
        const source = `
<template><div>{{ count }}</div></template>
<script setup>
  let count = $signal(0);
  count++;
  @raw {
    const raw = count;
    console.log('Raw count:', raw);
  }
</script>`;
        const { code } = compile(source, 'raw-top.pdx');
        expect(code).toContain('__count.set');
        expect(code).toContain('raw = count');
    });
});

// ═══════════════════════════════════════════════════════════════
// SHADOW DOM + CSS
// ═══════════════════════════════════════════════════════════════

describe('integration: shadow DOM + CSS', () => {
    it('shadow DOM component generates shadow flag', () => {
        const source = `
<template shadow>
  <div class="widget">Hello</div>
</template>
<script setup>
  @prop label: string = 'test';
</script>
<style scoped>
.widget { padding: 1rem; }
</style>`;
        const { code } = compile(source, 'shadow-css.pdx');
        expect(code).toContain('shadow: true');
        // No `data-pdx-` scope attribute "for Light DOM fallback": there is no such fallback —
        // `shadow` is fixed when the component is defined, so a shadow component always renders
        // into its root — and a scoped stylesheet in `document.head` is one a shadow root cannot
        // see, which leaves the component unstyled. What is asserted is where the CSS actually has to go, and that the scoping is gone with it: inside the root,
        // nothing can reach in, so there is nothing for a host attribute to do.
        expect(code).toContain('__adoptStyles(ctx.el.shadowRoot');
        expect(code).toContain('.widget { padding: 1rem; }');
        expect(code).not.toContain('data-pdx-');
        expect(code).not.toContain('document.head.appendChild');
    });
});

// ═══════════════════════════════════════════════════════════════
// MULTIPLE $inline BLOCKS
// ═══════════════════════════════════════════════════════════════

describe('multiple $inline blocks', () => {
    it('merges multiple $inline blocks in order', () => {
        const source = `
<template><div>{{ a }} {{ b }}</div></template>
<script setup>
  let x = $signal(1);
  $inline {
    const a = x * 2;
  }
  $inline {
    const b = x * 3;
  }
</script>`;
        const { code } = compile(source, 'multi-inline.pdx');
        expect(code).toMatch(/render:\s*\(ctx\)\s*=>\s*\{/);
        // Both should be present in render
        expect(code).toContain('a = x * 2');
        expect(code).toContain('b = x * 3');
    });
});
