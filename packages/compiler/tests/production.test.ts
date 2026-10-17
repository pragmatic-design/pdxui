// What a production build does to a .pdx, on its one render path, the inline one (#107). The
// optimisations the template path had — binding deduplication, constant condition elimination,
// loop-invariant hoisting — are asserted here on the inline path, which carries them since #236.
import { describe, it, expect } from 'vitest';
import { minifyCSS } from '../src/compiler/codegen-styles';
import { compileSFC } from '../src/compiler/codegen';
import { compile } from '../src/plugin';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';
import { markup, builds, elementsBuilt } from './static-markup-of';

describe('CSS minification', () => {
    it('collapses whitespace', () => {
        const result = minifyCSS('.btn  {  color:  red;  }');
        expect(result).toBe('.btn{color:red}');
    });

    it('strips comments', () => {
        const result = minifyCSS('/* comment */ .btn { color: red; }');
        expect(result).toBe('.btn{color:red}');
    });

    it('removes last semicolon before }', () => {
        const result = minifyCSS('.btn { color: red; margin: 0; }');
        expect(result).toBe('.btn{color:red;margin:0}');
    });

    it('handles multi-line CSS', () => {
        const css = `
.card {
    padding: 16px;
    margin: 8px;
    border-radius: 8px;
}

.card:hover {
    box-shadow: 0 2px 4px rgba(0,0,0,.1);
}
`;
        const result = minifyCSS(css);
        expect(result).not.toContain('\n');
        expect(result).toContain('.card{');
        expect(result).toContain('.card:hover{');
    });

    it('preserves @media queries', () => {
        const css = '@media (max-width: 768px) { .sidebar { display: none; } }';
        const result = minifyCSS(css);
        expect(result).toContain('@media');
        expect(result).toContain('display:none');
    });
});

describe('production mode compilation', () => {
    it('minifies CSS in production mode', () => {
        const source = `
<template><div class="box">Hello</div></template>
<script setup>
let x = $signal(0);
</script>
<style scoped>
.box {
    padding: 16px;
    margin: 8px;
}
</style>`;
        const descriptor = parseSFC(source);
        const ast = parseTemplate(descriptor.template!.content);

        const devCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: false });
        const prodCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: true });

        // Production should have minified CSS (shorter)
        const devStyle = devCode.match(/textContent = "([^"]*)"/)?.[1] ?? '';
        const prodStyle = prodCode.match(/textContent = "([^"]*)"/)?.[1] ?? '';
        expect(prodStyle.length).toBeLessThanOrEqual(devStyle.length);
        // Production should not have unnecessary whitespace
        expect(prodStyle).not.toMatch(/\s{2,}/);
    });

    it('dev mode keeps CSS readable', () => {
        const source = `
<template><div>Test</div></template>
<style>
.test {
    color: red;
    padding: 0;
}
</style>`;
        const descriptor = parseSFC(source);
        const ast = parseTemplate(descriptor.template!.content);

        const devCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: false });
        // Dev mode preserves formatting
        expect(devCode).toContain('color: red');
    });

    it('production strips signal debug names', () => {
        const source = `<template><div>{{ count }}</div></template>
<script setup>
let count = $signal(0);
</script>`;
        const descriptor = parseSFC(source);
        const ast = parseTemplate(descriptor.template!.content);

        const prodCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: true });
        expect(prodCode).not.toContain("name: 'test:count'");
        expect(prodCode).toContain('signal(0)');

        const devCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: false });
        expect(devCode).toContain("name: 'test:count'");
    });

    it('production hoists loop-invariant signals in @for', () => {
        const source = `<template>
@for (items as item; track item.id) {
  <div>{{ item.name }} - {{ count }}</div>
}
</template>
<script setup>
let items = $signal([]);
let count = $signal(0);
</script>`;
        const descriptor = parseSFC(source);
        const ast = parseTemplate(descriptor.template!.content);

        // The inline name carries the generator's counter.
        const prodCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: true });
        expect(prodCode).toMatch(/__li\d+_count=computed\(\(\)=>ctx\.count\(\)\)/);

        const devCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: false });
        // In dev, no hoisting — direct ctx.count() read inside loop
        expect(devCode).not.toContain('__li');
    });

    it('a static component renders with nothing reactive: no effect, no binding helper', () => {
        const source = `<template><div>About Page</div></template>
<script setup>
@page '/about';
</script>`;
        const descriptor = parseSFC(source);
        const ast = parseTemplate(descriptor.template!.content);

        const prodCode = compileSFC(descriptor, ast, 'about.pdx', null, { production: true });
        // staticBlock is the markup built once and copied (#109), staticMarkup the HTML it is
        // written as (#369): nothing reactive.
        expect(prodCode).toMatch(/^import \{ component, staticBlock, staticMarkup \} from '@pdxui\/core';/);
        expect(prodCode).not.toMatch(/effect\(|bindInterpolation\(/);
    });
});

// ═══════════════════════════════════════════════════════════════
// Phase 1 Optimizations: Dead Signal, Constant Condition, Binding Dedup
// ═══════════════════════════════════════════════════════════════

describe('dead signal elimination', () => {
    it('production eliminates signals with zero references', () => {
        const source = `<template><div>Hello</div></template>
<script setup>
let count = $signal(0);
let name = $signal('world');
</script>`;
        const { code } = compile(source, 'dead-sig.pdx', [], undefined, { production: true });
        expect(code).not.toContain('signal(0)');
        expect(code).not.toContain("signal('world')");
    });

    it('production keeps signals used in template', () => {
        const source = `<template><div>{{ count }}</div></template>
<script setup>
let count = $signal(0);
let unused = $signal(99);
</script>`;
        const { code } = compile(source, 'keep-sig.pdx', [], undefined, { production: true });
        expect(code).toContain('signal(0)');    // count is used in template
        expect(code).not.toContain('signal(99)'); // unused is dead
    });

    it('production keeps signals used in effects', () => {
        const source = `<template><div>Test</div></template>
<script setup>
let count = $signal(0);
$effect(() => console.log(count));
</script>`;
        const { code } = compile(source, 'effect-sig.pdx', [], undefined, { production: true });
        expect(code).toContain('signal(0)');
    });

    it('production keeps signals used in derived', () => {
        const source = `<template><div>{{ doubled }}</div></template>
<script setup>
let count = $signal(0);
const doubled = $derived(count * 2);
</script>`;
        const { code } = compile(source, 'derived-sig.pdx', [], undefined, { production: true });
        expect(code).toContain('signal(0)');
    });

    it('production keeps signals used in body', () => {
        const source = `<template><div>Test</div></template>
<script setup>
let count = $signal(0);
function increment() { count++; }
</script>`;
        const { code } = compile(source, 'body-sig.pdx', [], undefined, { production: true });
        expect(code).toContain('signal(0)'); // used in body (count++)
    });

    it('production keeps signals used by other signals', () => {
        const source = `<template><div>{{ b }}</div></template>
<script setup>
let a = $signal(1);
let b = $signal(a);
</script>`;
        const { code } = compile(source, 'cross-sig.pdx', [], undefined, { production: true });
        // a is used in b's initializer → not dead
        expect(code).toContain('signal(1)');
    });

    it('dev mode does not eliminate dead signals', () => {
        const source = `<template><div>Hello</div></template>
<script setup>
let count = $signal(0);
</script>`;
        const { code } = compile(source, 'dev-dead.pdx', [], undefined, { production: false });
        // Dev mode keeps signals even if unused (debug name present)
        expect(code).toContain('__count');
    });

    it('dead signal is also removed from auto-return', () => {
        const source = `<template><div>{{ kept }}</div></template>
<script setup>
let kept = $signal('yes');
let dead = $signal('no');
</script>`;
        const { code } = compile(source, 'ret.pdx', [], undefined, { production: true });
        expect(code).toContain('kept: __kept');
        expect(code).not.toContain('dead');
    });
});

describe('constant condition elimination', () => {
    it('production inlines @if(true) branch', () => {
        const source = `<template>
@if (true) {
  <div>Always visible</div>
}
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'const-if.pdx', [], undefined, { production: true });
        expect(code).toContain('Always visible');
        expect(code).not.toContain('when(');
    });

    it('production eliminates @if(false) entirely', () => {
        const source = `<template>
<p>Before</p>
@if (false) {
  <div>Never visible</div>
}
<p>After</p>
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'const-if-false.pdx', [], undefined, { production: true });
        expect(code).not.toContain('Never visible');
        expect(code).not.toContain('when(');
        expect(code).toContain('Before');
        expect(code).toContain('After');
    });

    it('production inlines @if(false) else branch', () => {
        const source = `<template>
@if (false) {
  <div>Hidden</div>
} @else {
  <div>Fallback</div>
}
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'const-else.pdx', [], undefined, { production: true });
        expect(code).not.toContain('Hidden');
        expect(code).toContain('Fallback');
        expect(code).not.toContain('when(');
    });

    it('production inlines @show(true)', () => {
        const source = `<template>
@show (true) {
  <div>Visible</div>
}
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'const-show-true.pdx', [], undefined, { production: true });
        expect(code).toContain('Visible');
        expect(code).not.toContain('show(');
    });

    it('production eliminates @show(false)', () => {
        const source = `<template>
@show (false) {
  <div>Hidden</div>
}
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'const-show-false.pdx', [], undefined, { production: true });
        expect(code).not.toContain('Hidden');
        expect(code).not.toContain('show(');
    });

    it('dev mode keeps @if(true) with when() wrapper', () => {
        const source = `<template>
@if (true) {
  <div>Always</div>
}
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'dev-const.pdx', [], undefined, { production: false });
        expect(code).toContain('when(');
    });

    it('dynamic conditions are NOT eliminated in production', () => {
        const source = `<template>
@if (visible) {
  <div>Dynamic</div>
}
</template>
<script setup>
let visible = $signal(true);
</script>`;
        const { code } = compile(source, 'dyn-if.pdx', [], undefined, { production: true });
        expect(code).toContain('when(');
    });
});

describe('binding deduplication', () => {
    it('production deduplicates identical complex binding expressions', () => {
        const source = `<template>
<button :disabled="count > 0" :hidden="count > 0">Save</button>
</template>
<script setup>
let count = $signal(0);
</script>`;
        const { code } = compile(source, 'dedup.pdx', [], undefined, { production: true });
        // Should have a shared computed for the duplicated expression
        expect(code).toContain('__bd_0');
        expect(code).toContain('computed(');
    });

    it('production does not deduplicate unique expressions', () => {
        const source = `<template>
<button :disabled="loading" :class="{ active: active }">Save</button>
</template>
<script setup>
let loading = $signal(false);
let active = $signal(true);
</script>`;
        const { code } = compile(source, 'no-dedup.pdx', [], undefined, { production: true });
        expect(code).not.toContain('__bd_');
    });

    it('dev mode does not deduplicate bindings', () => {
        const source = `<template>
<button :disabled="count > 0" :aria-busy="count > 0">Save</button>
</template>
<script setup>
let count = $signal(0);
</script>`;
        const { code } = compile(source, 'dev-dedup.pdx', [], undefined, { production: false });
        expect(code).not.toContain('__bd_');
    });

    it('dedup wraps render in IIFE for scoping', () => {
        const source = `<template>
<div :disabled="items.length === 0" :hidden="items.length === 0">Empty</div>
</template>
<script setup>
let items = $signal([]);
</script>`;
        const { code } = compile(source, 'dedup-iife.pdx', [], undefined, { production: true });
        // The IIFE pattern: (() => { const __bd_0 = ...; return html`...`; })()
        expect(code).toContain('(() => {');
        expect(code).toContain('__bd_0');
    });

    it('multiple different duplicates get separate computeds', () => {
        const source = `<template>
<div :class="{ a: x > 0, b: x > 0, c: y > 0, d: y > 0 }">Test</div>
</template>
<script setup>
let x = $signal(0);
let y = $signal(0);
</script>`;
        const { code } = compile(source, 'multi-dedup.pdx', [], undefined, { production: true });
        expect(code).toContain('__bd_0');
        expect(code).toContain('__bd_1');
    });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Prop Narrowing + Static Template Pre-compilation
// ═══════════════════════════════════════════════════════════════

describe('prop narrowing — _skipAttrSync removed (dev/prod parity)', () => {
    it('production does NOT emit _skipAttrSync (removed for dev/prod parity)', () => {
        const source = `<template><div>{{ label }}</div></template>
<script setup>
@prop label: string = 'Hello';
</script>`;
        const { code } = compile(source, 'prop-narrow.pdx', [], undefined, { production: true });
        expect(code).not.toContain('_skipAttrSync');
    });

    it('dev mode does NOT emit _skipAttrSync', () => {
        const source = `<template><div>{{ label }}</div></template>
<script setup>
@prop label: string = 'Hello';
</script>`;
        const { code } = compile(source, 'dev-prop.pdx', [], undefined, { production: false });
        expect(code).not.toContain('_skipAttrSync');
    });
});

// The template path pre-compiled a fully static template into `__staticHTML`. The inline path
// builds the same DOM directly; its own pre-compiled form — a <template> cloned per mount — is #109.
describe('static templates', () => {
    it('a build renders a static component inline: no __staticHTML, no html``', () => {
        const source = `<template><div>Static</div></template>
<script setup>
@page '/static';
</script>`;
        const { code } = compile(source, 'static.pdx', [], undefined, { production: true });
        expect(code).not.toContain('__staticHTML');
        expect(code).not.toMatch(/import.*\bhtml\b.*from '@pdxui\/core'/);
        expect(builds(code, 'div')).toBe(true);
    });

    it('dev mode renders a static component inline, as a build does (#107)', () => {
        const source = `<template><div>About Page</div></template>
<script setup>
@page '/about';
</script>`;
        const { code } = compile(source, 'dev-about.pdx', [], undefined, { production: false });
        expect(code).not.toContain('__staticHTML');
        expect(code).not.toContain("html\`");
        expect(builds(code, 'div')).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Binding Inlining (imperative DOM codegen)
// ═══════════════════════════════════════════════════════════════

describe('inline bindings (Phase 3)', () => {
    it('builds its static markup instead of html``', () => {
        const source = `<template><div class="card">Hello</div></template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'inline.pdx', [], undefined, { production: true });
        expect(builds(code, 'div')).toBe(true);
        // The static markup is built once and copied per render (#109).
        expect(code).toContain('staticBlock(');
        expect(code).not.toContain("html\`");
    });

    it('generates effect for :prop bindings', () => {
        const source = `<template>
<button :disabled="loading">Save</button>
</template>
<script setup>
let loading = $signal(false);
</script>`;
        const { code } = compile(source, 'inline-prop.pdx', [], undefined, { production: true });
        expect(builds(code, 'button')).toBe(true);
        expect(code).toContain("effect(");
        expect(code).toContain('disabled');
    });

    it('generates addEventListener for @event', () => {
        const source = `<template>
<button @click="save">Save</button>
</template>
<script setup>
@prop label: string = '';
function save() {}
</script>`;
        const { code } = compile(source, 'inline-event.pdx', [], undefined, { production: true });
        expect(code).toContain("addEventListener('click'");
    });

    it('generates event modifiers correctly', () => {
        const source = `<template>
<button @click.prevent.stop="save">Save</button>
</template>
<script setup>
@prop label: string = '';
function save() {}
</script>`;
        const { code } = compile(source, 'inline-mod.pdx', [], undefined, { production: true });
        expect(code).toContain('preventDefault');
        expect(code).toContain('stopPropagation');
    });

    it('generates reactive text for interpolations', () => {
        const source = `<template>
<span>{{ count }}</span>
</template>
<script setup>
let count = $signal(0);
</script>`;
        const { code } = compile(source, 'inline-text.pdx', [], undefined, { production: true });
        // The text node the interpolation binds: an empty comment in the HTML, which staticMarkup
        // turns into an empty text node (#369).
        expect(markup(code).join('')).toContain('<span><!----></span>');
        // core's bindInterpolation follows the signal, as the template path's interpolation does (#100).
        expect(code).toContain('bindInterpolation(__t1,()=>ctx.count())');
    });

    it('handles @if with when() helper', () => {
        const source = `<template>
@if (visible) {
  <div>Shown</div>
}
</template>
<script setup>
let visible = $signal(true);
</script>`;
        const { code } = compile(source, 'inline-if.pdx', [], undefined, { production: true });
        expect(code).toContain('when(');
        expect(builds(code, 'div')).toBe(true);
    });

    it('handles @for with the eachRow() helper', () => {
        const source = `<template>
@for (items as item; track item.id) {
  <div>{{ item.name }}</div>
}
</template>
<script setup>
let items = $signal([]);
</script>`;
        const { code } = compile(source, 'inline-for.pdx', [], undefined, { production: true });
        expect(code).toContain('eachRow(');
        expect(builds(code, 'div')).toBe(true);
    });

    it('does not call scoped loop properties as signals in inline mode', () => {
        const source = `<template>
@for (items as item; track item.id) {
  <div>{{ item.name }}</div>
}
</template>
<script setup>
let items = $signal([]);
</script>`;
        const { code } = compile(source, 'inline-for-scope.pdx', [], undefined, { production: true });
        // The item is a row getter; its PROPERTY is still never called.
        // The value goes through core's bindInterpolation, not a bare String().
        expect(code).toContain('()=>item().name)');
        expect(code).not.toContain('item.name()');
        expect(code).not.toContain('item().name()');
    });

    it('does not call non-signal setup values as signals in inline mode', () => {
        const source = `<template>
<div :title="helper">{{ helper }}</div>
</template>
<script setup>
let count = $signal(0);
const helper = 'ok';
</script>`;
        const { code } = compile(source, 'inline-nonsignal.pdx', [], undefined, { production: true });
        expect(code).toContain('ctx.helper');
        expect(code).not.toContain('ctx.helper()');
    });

    it('handles nested elements correctly', () => {
        const source = `<template>
<div class="outer"><span class="inner">Text</span></div>
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'inline-nest.pdx', [], undefined, { production: true });
        // The span is built inside the div.
        expect(markup(code).join('')).toContain('<div class="outer"><span class="inner">Text</span></div>');
    });

    it('handles ::twoWay bindings', () => {
        const source = `<template>
<input ::value="name" />
</template>
<script setup>
let name = $signal('');
</script>`;
        const { code } = compile(source, 'inline-twoway.pdx', [], undefined, { production: true });
        // Core's two-way wiring, handed the signal itself (#97): which event, and how the value is
        // read back, is the runtime's — measured on both paths by core's render-parity table.
        expect(code).toMatch(/bindTwoWay\(__el\d+, 'value', ctx\.name\);/);
        expect(code).toMatch(/import \{[^}]*\bbindTwoWay\b[^}]*\} from '@pdxui\/core'/);
    });

    it('handles :class object toggle bindings', () => {
        const source = `<template>
<div :class="{ active: isActive }">Card</div>
</template>
<script setup>
let isActive = $signal(false);
</script>`;
        const { code } = compile(source, 'inline-class.pdx', [], undefined, { production: true });
        expect(code).toContain('classList.toggle');
        expect(code).toContain('"active"');
    });

    it('dead signal elimination still works with inline bindings', () => {
        const source = `<template><div>Hello</div></template>
<script setup>
let unused = $signal(0);
</script>`;
        const { code } = compile(source, 'inline-dead.pdx', [], undefined, { production: true });
        expect(code).not.toContain('signal(0)');
    });

    it('handles void elements (input, br, img)', () => {
        const source = `<template>
<input type="text" :disabled="off" />
<br>
<img src="logo.png" />
</template>
<script setup>
let off = $signal(false);
</script>`;
        const { code } = compile(source, 'inline-void.pdx', [], undefined, { production: true });
        expect(builds(code, 'input')).toBe(true);
        expect(builds(code, 'br')).toBe(true);
        expect(builds(code, 'img')).toBe(true);
        // Void: no closing tag, and the next element is a sibling.
        expect(markup(code).join('')).not.toMatch(/<\/(input|br|img)>/);
    });

    it('handles :style object and @show bindings', () => {
        const source = `<template>
@show (visible) { <div :style="{ color: textColor }">Styled</div> }
</template>
<script setup>
let textColor = $signal('red');
let visible = $signal(true);
</script>`;
        const { code } = compile(source, 'inline-style.pdx', [], undefined, { production: true });
        expect(code).toContain('style.setProperty');
        expect(code).toMatch(/\.style\.display=\(ctx\.visible\(\)\)/);
    });

    it('handles ref bindings', () => {
        const source = `<template>
<input :ref="inputRef" />
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'inline-ref.pdx', [], undefined, { production: true });
        // Through core's bindRef, the template path's own, which sets the ref and resets it (#262).
        expect(code).toMatch(/bindRef\(__el\d+,ctx\.inputRef\);/);
        expect(code).toMatch(/import\s*\{[^}]*\bbindRef\b[^}]*\}\s*from\s*'@pdxui\/core'/);
    });

    it('handles deeply nested elements', () => {
        const source = `<template>
<div class="l1"><div class="l2"><div class="l3"><span>Deep</span></div></div></div>
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'inline-deep.pdx', [], undefined, { production: true });
        // 4 elements (div, div, div, span) in the block's builder, each inside the one before.
        expect(elementsBuilt(code)).toBe(4);
        expect(markup(code).join('')).toContain('<div class="l1"><div class="l2"><div class="l3"><span>Deep</span></div></div></div>');
    });

    it('handles multiple interpolations in sequence', () => {
        const source = `<template>
<span>{{ first }} {{ last }}</span>
</template>
<script setup>
let first = $signal('John');
let last = $signal('Doe');
</script>`;
        const { code } = compile(source, 'inline-multi-interp.pdx', [], undefined, { production: true });
        // Two text nodes, each following its own signal
        expect(code).toContain('()=>ctx.first())');
        expect(code).toContain('()=>ctx.last())');
        expect((code.match(/bindInterpolation\(/g) || []).length).toBe(2);
    });

    it('handles @switch control flow', () => {
        const source = `<template>
@switch (status) {
  @case ('active') { <span>Active</span> }
  @case ('inactive') { <span>Inactive</span> }
  @default { <span>Unknown</span> }
}
</template>
<script setup>
let status = $signal('active');
</script>`;
        const { code } = compile(source, 'inline-switch.pdx', [], undefined, { production: true });
        expect(code).toContain('match(');
        expect(builds(code, 'span')).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// Benchmarks: output size comparison across modes
// ═══════════════════════════════════════════════════════════════

describe('production output size benchmarks', () => {
    const counterSrc = `
<template>
  <div class="counter">
    <h3>{{ label }}</h3>
    <span>{{ count }}</span>
    <button @click="inc">+</button>
    @if (count > 10) { <div class="alert">High!</div> }
  </div>
</template>
<script setup>
  @prop label: string = 'Counter';
  @prop initial: number = 0;
  let count = $signal(initial);
  const doubled = $derived(count * 2);
  function inc() { count++; }
  function dec() { count--; }
</script>
<style scoped>
  .counter { padding: 1rem; }
  .alert { color: red; }
</style>`;

    const staticSrc = `
<template>
  <div class="about"><h1>About Us</h1><p>Static content here.</p></div>
</template>
<script setup>
  @page '/about';
</script>`;

    it('production output is smaller than dev output', () => {
        const { code: devCode } = compile(counterSrc, 'counter.pdx', [], undefined, { production: false });
        const { code: prodCode } = compile(counterSrc, 'counter.pdx', [], undefined, { production: true });
        // Production strips debug names, minifies CSS → smaller
        expect(prodCode.length).toBeLessThan(devCode.length);
    });

    it('a build produces output without html`` overhead', () => {
        const { code: prodCode } = compile(counterSrc, 'counter.pdx', [], undefined, { production: true });
        expect(prodCode).not.toContain("html\`");
        expect(builds(prodCode)).toBe(true);
    });

    it('a static component is smaller in a build than in dev, and imports nothing reactive', () => {
        const { code: devCode } = compile(staticSrc, 'about.pdx', [], undefined, { production: false });
        const { code: prodCode } = compile(staticSrc, 'about.pdx', [], undefined, { production: true });
        expect(prodCode.length).toBeLessThanOrEqual(devCode.length);
        expect(prodCode).toMatch(/^import \{ component, staticBlock, staticMarkup \} from '@pdxui\/core';/);
    });

    it('dead signal elimination reduces output size', () => {
        const srcWithDead = `<template><div>{{ used }}</div></template>
<script setup>
let used = $signal('yes');
let dead1 = $signal(0);
let dead2 = $signal('nope');
let dead3 = $signal([]);
</script>`;
        const { code: devCode } = compile(srcWithDead, 'dead.pdx', [], undefined, { production: false });
        const { code: prodCode } = compile(srcWithDead, 'dead.pdx', [], undefined, { production: true });
        // 3 dead signals eliminated → significantly shorter
        expect(prodCode.length).toBeLessThan(devCode.length);
        // Only 'used' signal should survive
        expect(prodCode).toContain("signal('yes')");
        expect(prodCode).not.toContain('signal(0)');
        expect(prodCode).not.toContain("signal('nope')");
        expect(prodCode).not.toContain('signal([])');
    });

    it('constant condition elimination reduces output size', () => {
        const srcWithConst = `<template>
<div>Always</div>
@if (true) { <div>Visible</div> }
@if (false) { <div>Never</div> }
@show (true) { <div>Shown</div> }
@show (false) { <div>Hidden</div> }
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code: devCode } = compile(srcWithConst, 'const.pdx', [], undefined, { production: false });
        const { code: prodCode } = compile(srcWithConst, 'const.pdx', [], undefined, { production: true });
        // Dev has when() and the display binding of a one-element @show; prod inlines/eliminates them
        expect(devCode).toContain('when(');
        expect(devCode).toContain('.style.display=(true)');
        expect(prodCode).not.toContain('when(');
        expect(prodCode).not.toContain('.style.display=');
        expect(prodCode.length).toBeLessThan(devCode.length);
    });
});
