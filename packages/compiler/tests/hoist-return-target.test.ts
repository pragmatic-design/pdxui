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

// ⚠️ `inlineBindings: false` throughout, and it is not a workaround: it names the path this
// file measures. A production build takes the INLINE path, and that path applies the
// loop-invariant hoist too — the transform both paths share is asserted on both,
// in `loop-invariant-both-paths.test.ts`. What is still the template path's own is the binding
// deduplication and the escaping of the tagged template, which is what the flag pins here.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

/** A page that documents a function — so the template text contains the word `return `. */
const SOURCE = `
<template>
  <div>
    <pdx-probe :items="rows"></pdx-probe>
    <pdx-probe :items="rows"></pdx-probe>
    <pre class="doc"><code>// renderFn = (item) =&gt; {
//   return '&lt;b&gt;' + item + '&lt;/b&gt;';
// }</code></pre>
  </div>
</template>
<script setup>
let keep = $signal(0);
const rows = [1, 2];
$inline {
  const unused = keep;
}
</script>`;

describe('hoisted declarations target the render return', () => {
    it('declares the deduped binding before the template, not inside it', () => {
        const { code } = compile(SOURCE, 'hoist-probe.pdx', undefined, undefined, { production: true, inlineBindings: false });

        // The optimisation must actually have run, or this test proves nothing.
        expect(code, 'binding dedup did not trigger — the probe no longer exercises the bug')
            .toContain('__bd_0');

        const decl = code.indexOf('const __bd_0');
        const ret = code.indexOf('return html`');
        expect(decl, 'the hoisted declaration was never emitted as code').toBeGreaterThan(-1);
        expect(ret, 'no render return found').toBeGreaterThan(-1);
        expect(decl, 'the declaration landed after `return html` — i.e. inside the template')
            .toBeLessThan(ret);
    });

    it('leaves the documented snippet exactly as the author wrote it', () => {
        const { code } = compile(SOURCE, 'hoist-probe.pdx', undefined, undefined, { production: true, inlineBindings: false });
        expect(code, 'the hoisting rewrote the page content').toContain("//   return '&lt;b&gt;' + item + '&lt;/b&gt;';");
    });
});
