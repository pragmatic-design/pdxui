// ⚠️ `inlineBindings: false` throughout, and it is not a workaround: it names the path this
// file measures. A production build takes the INLINE path, and that path applies the
// loop-invariant hoist too — the transform both paths share is asserted on both,
// in `loop-invariant-both-paths.test.ts`. What is still the template path's own is the binding
// deduplication and the escaping of the tagged template, which is what the flag pins here.
import { describe, it, expect } from 'vitest';
import { minifyCSS } from '../src/compiler/codegen-styles';
import { compileSFC } from '../src/compiler/codegen';
import { compile } from '../src/plugin';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';

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
        const prodCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: true, inlineBindings: false });

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

        const prodCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: true, inlineBindings: false });
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

        // Both paths: the hoist is the one transform they share, and the inline path
        // — the default — is what a build actually takes, so pinning this to the other one would
        // assert it of nothing shipped. The inline name carries the generator's counter.
        for (const inlineBindings of [false, true]) {
            const prodCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: true, inlineBindings });
            expect(prodCode, `inlineBindings: ${inlineBindings}`).toMatch(/__li\d*_count/);
            expect(prodCode).toContain('computed(');
        }

        const devCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: false });
        // In dev, no hoisting — direct ctx.count() read inside loop
        expect(devCode).not.toContain('__li');
    });

    it('production marks static components with static:true', () => {
        const source = `<template><div>About Page</div></template>
<script setup>
@page '/about';
</script>`;
        const descriptor = parseSFC(source);
        const ast = parseTemplate(descriptor.template!.content);

        const prodCode = compileSFC(descriptor, ast, 'about.pdx', null, { production: true, inlineBindings: false });
        expect(prodCode).toContain('static: true');

        const devCode = compileSFC(descriptor, ast, 'about.pdx', null, { production: false });
        expect(devCode).not.toContain('static: true');
    });

    it('production does NOT mark dynamic components as static', () => {
        const source = `<template><div>{{ count }}</div></template>
<script setup>
let count = $signal(0);
</script>`;
        const descriptor = parseSFC(source);
        const ast = parseTemplate(descriptor.template!.content);

        const prodCode = compileSFC(descriptor, ast, 'test.pdx', null, { production: true, inlineBindings: false });
        expect(prodCode).not.toContain('static: true');
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
        const { code } = compile(source, 'dead-sig.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).not.toContain('signal(0)');
        expect(code).not.toContain("signal('world')");
    });

    it('production keeps signals used in template', () => {
        const source = `<template><div>{{ count }}</div></template>
<script setup>
let count = $signal(0);
let unused = $signal(99);
</script>`;
        const { code } = compile(source, 'keep-sig.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).toContain('signal(0)');    // count is used in template
        expect(code).not.toContain('signal(99)'); // unused is dead
    });

    it('production keeps signals used in effects', () => {
        const source = `<template><div>Test</div></template>
<script setup>
let count = $signal(0);
$effect(() => console.log(count));
</script>`;
        const { code } = compile(source, 'effect-sig.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).toContain('signal(0)');
    });

    it('production keeps signals used in derived', () => {
        const source = `<template><div>{{ doubled }}</div></template>
<script setup>
let count = $signal(0);
const doubled = $derived(count * 2);
</script>`;
        const { code } = compile(source, 'derived-sig.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).toContain('signal(0)');
    });

    it('production keeps signals used in body', () => {
        const source = `<template><div>Test</div></template>
<script setup>
let count = $signal(0);
function increment() { count++; }
</script>`;
        const { code } = compile(source, 'body-sig.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).toContain('signal(0)'); // used in body (count++)
    });

    it('production keeps signals used by other signals', () => {
        const source = `<template><div>{{ b }}</div></template>
<script setup>
let a = $signal(1);
let b = $signal(a);
</script>`;
        const { code } = compile(source, 'cross-sig.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'ret.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'const-if.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'const-if-false.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'const-else.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'const-show-true.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'const-show-false.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'dyn-if.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'dedup.pdx', [], undefined, { production: true, inlineBindings: false });
        // Should have a shared computed for the duplicated expression
        expect(code).toContain('__bd_0');
        expect(code).toContain('computed(');
    });

    it('production does not deduplicate unique expressions', () => {
        const source = `<template>
<button :disabled="loading" :class.active="active">Save</button>
</template>
<script setup>
let loading = $signal(false);
let active = $signal(true);
</script>`;
        const { code } = compile(source, 'no-dedup.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'dedup-iife.pdx', [], undefined, { production: true, inlineBindings: false });
        // The IIFE pattern: (() => { const __bd_0 = ...; return html`...`; })()
        expect(code).toContain('(() => {');
        expect(code).toContain('__bd_0');
    });

    it('multiple different duplicates get separate computeds', () => {
        const source = `<template>
<div :class.a="x > 0" :class.b="x > 0" :class.c="y > 0" :class.d="y > 0">Test</div>
</template>
<script setup>
let x = $signal(0);
let y = $signal(0);
</script>`;
        const { code } = compile(source, 'multi-dedup.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code } = compile(source, 'prop-narrow.pdx', [], undefined, { production: true, inlineBindings: false });
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

describe('static template pre-compilation', () => {
    it('production uses __staticHTML for fully static components', () => {
        const source = `<template><div>About Page</div></template>
<script setup>
@page '/about';
</script>`;
        const { code } = compile(source, 'about.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).toContain('__staticHTML');
        expect(code).not.toContain("html\`");
        expect(code).toContain('static: true');
    });

    it('production imports __staticHTML instead of html for static components', () => {
        const source = `<template><div>Static</div></template>
<script setup>
@page '/static';
</script>`;
        const { code } = compile(source, 'static.pdx', [], undefined, { production: true, inlineBindings: false });
        // Should import __staticHTML, not html
        expect(code).toMatch(/import.*__staticHTML.*from '@pdxui\/core'/);
        expect(code).not.toMatch(/import.*\bhtml\b.*from '@pdxui\/core'/);
    });

    it('production keeps html`` for dynamic components', () => {
        const source = `<template><div>{{ count }}</div></template>
<script setup>
let count = $signal(0);
</script>`;
        const { code } = compile(source, 'dynamic.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).not.toContain('__staticHTML');
        expect(code).toContain("html\`");
    });

    it('dev mode keeps html`` even for static components', () => {
        const source = `<template><div>About Page</div></template>
<script setup>
@page '/about';
</script>`;
        const { code } = compile(source, 'dev-about.pdx', [], undefined, { production: false });
        expect(code).not.toContain('__staticHTML');
        expect(code).toContain("html\`");
    });

    it('static render uses arrow without ctx parameter', () => {
        const source = `<template><div>No bindings</div></template>
<script setup>
@page '/plain';
</script>`;
        const { code } = compile(source, 'plain.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).toContain('render: () =>');
        expect(code).not.toContain('render: (ctx)');
    });
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Binding Inlining (imperative DOM codegen)
// ═══════════════════════════════════════════════════════════════

describe('inline bindings (Phase 3)', () => {
    it('generates createElement instead of html``', () => {
        const source = `<template><div class="card">Hello</div></template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'inline.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('document.createElement');
        expect(code).toContain('createDocumentFragment');
        expect(code).not.toContain("html\`");
    });

    it('generates effect for :prop bindings', () => {
        const source = `<template>
<button :disabled="loading">Save</button>
</template>
<script setup>
let loading = $signal(false);
</script>`;
        const { code } = compile(source, 'inline-prop.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('createElement');
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
        const { code } = compile(source, 'inline-event.pdx', [], undefined, { production: true, inlineBindings: true });
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
        const { code } = compile(source, 'inline-mod.pdx', [], undefined, { production: true, inlineBindings: true });
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
        const { code } = compile(source, 'inline-text.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('createTextNode');
        expect(code).toContain('effect(');
        expect(code).toContain('.data');
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
        const { code } = compile(source, 'inline-if.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('when(');
        expect(code).toContain('createElement');
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
        const { code } = compile(source, 'inline-for.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('eachRow(');
        expect(code).toContain('createElement');
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
        const { code } = compile(source, 'inline-for-scope.pdx', [], undefined, { production: true, inlineBindings: true });
        // The item is a row getter; its PROPERTY is still never called.
        // The text goes through core's rule, not a bare String().
        expect(code).toContain('interpolationText(item().name)');
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
        const { code } = compile(source, 'inline-nonsignal.pdx', [], undefined, { production: true, inlineBindings: true });
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
        const { code } = compile(source, 'inline-nest.pdx', [], undefined, { production: true, inlineBindings: true });
        // Should have nested appendChild calls
        expect(code).toContain("createElement('div')");
        expect(code).toContain("createElement('span')");
        expect(code).toContain('appendChild');
    });

    it('handles ::twoWay bindings', () => {
        const source = `<template>
<input ::value="name" />
</template>
<script setup>
let name = $signal('');
</script>`;
        const { code } = compile(source, 'inline-twoway.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('effect(');
        expect(code).toContain("addEventListener('input'");
        expect(code).toContain('.set(');
    });

    it('handles :class.x toggle bindings', () => {
        const source = `<template>
<div :class.active="isActive">Card</div>
</template>
<script setup>
let isActive = $signal(false);
</script>`;
        const { code } = compile(source, 'inline-class.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('classList.toggle');
        expect(code).toContain('"active"');
    });

    it('disabled by default (only with inlineBindings flag)', () => {
        const source = `<template><div>Hello</div></template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'no-inline.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).not.toContain('createDocumentFragment');
        // Without flag, uses standard html`` or __staticHTML
    });

    it('dead signal elimination still works with inline bindings', () => {
        const source = `<template><div>Hello</div></template>
<script setup>
let unused = $signal(0);
</script>`;
        const { code } = compile(source, 'inline-dead.pdx', [], undefined, { production: true, inlineBindings: true });
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
        const { code } = compile(source, 'inline-void.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain("createElement('input')");
        expect(code).toContain("createElement('br')");
        expect(code).toContain("createElement('img')");
    });

    it('handles :style.x and :show bindings', () => {
        const source = `<template>
<div :style.color="textColor" :show="visible">Styled</div>
</template>
<script setup>
let textColor = $signal('red');
let visible = $signal(true);
</script>`;
        const { code } = compile(source, 'inline-style.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('style.setProperty');
        expect(code).toContain('style.display');
    });

    it('handles ref bindings', () => {
        const source = `<template>
<input ref="inputRef" />
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'inline-ref.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('.set(');
    });

    it('handles deeply nested elements', () => {
        const source = `<template>
<div class="l1"><div class="l2"><div class="l3"><span>Deep</span></div></div></div>
</template>
<script setup>
@prop label: string = '';
</script>`;
        const { code } = compile(source, 'inline-deep.pdx', [], undefined, { production: true, inlineBindings: true });
        // 4 createElement calls (div, div, div, span) + correct nesting via appendChild
        const createCount = (code.match(/createElement/g) || []).length;
        expect(createCount).toBe(4);
        const appendCount = (code.match(/appendChild/g) || []).length;
        expect(appendCount).toBeGreaterThanOrEqual(4); // 4 elements + frag
    });

    it('handles multiple interpolations in sequence', () => {
        const source = `<template>
<span>{{ first }} {{ last }}</span>
</template>
<script setup>
let first = $signal('John');
let last = $signal('Doe');
</script>`;
        const { code } = compile(source, 'inline-multi-interp.pdx', [], undefined, { production: true, inlineBindings: true });
        // Two text nodes with effects
        const effectCount = (code.match(/effect\(/g) || []).length;
        expect(effectCount).toBeGreaterThanOrEqual(2);
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
        const { code } = compile(source, 'inline-switch.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code).toContain('match(');
        expect(code).toContain('createElement');
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
        const { code: prodCode } = compile(counterSrc, 'counter.pdx', [], undefined, { production: true, inlineBindings: false });
        // Production strips debug names, minifies CSS → smaller
        expect(prodCode.length).toBeLessThan(devCode.length);
    });

    it('inline bindings produce output without html`` overhead', () => {
        const { code: prodCode } = compile(counterSrc, 'counter.pdx', [], undefined, { production: true, inlineBindings: false });
        const { code: inlineCode } = compile(counterSrc, 'counter.pdx', [], undefined, { production: true, inlineBindings: true });
        // Inline doesn't use html`` tagged template
        expect(inlineCode).not.toContain("html\`");
        expect(inlineCode).toContain('createElement');
        // Both should produce valid output (not crash)
        expect(prodCode.length).toBeGreaterThan(0);
        expect(inlineCode.length).toBeGreaterThan(0);
    });

    it('static component uses __staticHTML (faster runtime, skips template engine)', () => {
        const { code: devCode } = compile(staticSrc, 'about.pdx', [], undefined, { production: false });
        const { code: prodCode } = compile(staticSrc, 'about.pdx', [], undefined, { production: true, inlineBindings: false });
        // Dev uses html`` tagged template (requires runtime parsing)
        expect(devCode).toContain("html\`");
        expect(devCode).not.toContain('__staticHTML');
        // Prod uses __staticHTML (pre-compiled, cloneNode — faster runtime)
        expect(prodCode).toContain('__staticHTML');
        expect(prodCode).not.toContain("html\`");
        expect(prodCode).toContain('static: true');
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
        const { code: prodCode } = compile(srcWithDead, 'dead.pdx', [], undefined, { production: true, inlineBindings: false });
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
        const { code: prodCode } = compile(srcWithConst, 'const.pdx', [], undefined, { production: true, inlineBindings: false });
        // Dev has when() and show() calls; prod inlines/eliminates them
        expect(devCode).toContain('when(');
        expect(devCode).toContain('show(');
        expect(prodCode).not.toContain('when(');
        expect(prodCode).not.toContain('show(');
        expect(prodCode.length).toBeLessThan(devCode.length);
    });
});
