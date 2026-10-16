// Hoisted declarations must be inserted before the render's `return`, not before a `return ` that
// happens to be TEXT inside the template.
//
// The render code is `{ …; return html`…` }`, so the template literal — every character the page
// displays — sits AFTER the only real return. A documentation block that shows a snippet of
// JavaScript therefore owns the last `return ` in the string, and code moved with
// `finalRenderCode.lastIndexOf('return ')` lands the hoisted `const` inside the page:
//
//     // renderFn = (item, index) =&gt; {
//     //   const __bd_0 = computed(() => ctx.basicSlides);   ← inserted here
//         return '&lt;div…';
//
// The declaration becomes displayed text, the `${__bd_0}` interpolations stay live, and the page
// dies on `ReferenceError: __bd_0 is not defined` — with no build error, because the module still
// parses.

// Since #107 the render is the inline path's, `{ …; return (() => { … })(); }` in block form, and what
// is still inserted before its return is a scoped slot's hoisted function; the deduplicated
// bindings are declared inside the render's own block (#236).
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { markup } from './static-markup-of';

/** A page that documents a function — so the template text contains the word `return `. */
const SOURCE = `
<template>
  <div>
    <pdx-probe :items="rows.length > keep ? rows : []"></pdx-probe>
    <pdx-probe :items="rows.length > keep ? rows : []"></pdx-probe>
    <pdx-list><slot name="item" let:row><b>{{ row }}</b></slot></pdx-list>
    <pre class="doc"><code>// renderFn = (item) =&gt; {
//   return '&lt;b&gt;' + item + '&lt;/b&gt;';
// }</code></pre>
  </div>
</template>
<script setup>
let keep = $signal(0);
let rows = $signal([1, 2]);
</script>`;

describe('hoisted declarations target the render return', () => {
    it('declares the hoisted slot and the deduped binding before they are used, not inside the page', () => {
        const { code } = compile(SOURCE, 'hoist-probe.pdx', undefined, undefined, { production: true });

        // Both must actually have run, or this test proves nothing.
        expect(code, 'binding dedup did not trigger — the probe no longer exercises it').toContain('const __bd_0');
        expect(code, 'no scoped slot was hoisted').toMatch(/const __pdxSlot_item_\d+ =/);

        const ret = code.indexOf('return (() => {');
        expect(ret, 'no render return found').toBeGreaterThan(-1);
        expect(code.search(/const __pdxSlot_item_\d+ =/), 'the slot landed after the render return — inside the page')
            .toBeLessThan(ret);
        expect(code.indexOf('const __bd_0'), 'the shared binding is declared after its first use')
            .toBeLessThan(code.indexOf('__bd_0()'));
    });

    it('leaves the documented snippet exactly as the author wrote it', () => {
        const { code } = compile(SOURCE, 'hoist-probe.pdx', undefined, undefined, { production: true });
        // In the block's HTML (#369), read back from its literal: the text is the author's, intact.
        expect(markup(code).join(''), 'the hoisting rewrote the page content').toContain("//   return '&lt;b&gt;' + item + '&lt;/b&gt;';");
    });
});
