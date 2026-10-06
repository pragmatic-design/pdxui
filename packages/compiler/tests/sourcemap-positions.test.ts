// Where a source map sends a statement of the setup script, read back from the map.
//
// A map built by guessing sections in the generated text — a line holding `setup(ctx)` opens the
// script, `render:` the template, a bare `});` closes either — and mapping each following line 1:1
// to column 0 sends 0 of 10 probes to the right line on real files: a hoisted `$derived` moves every
// line after it, a `render:` key or a `});` inside the setup ends the section early, and
// auto-imports are spliced in after the map is built. `sourcemap.test.ts` checks the map's
// structure, not a position.
//
// Each probe names a statement in the .pdx and the text it becomes in the module, decodes the map
// with the small decoder below (the compiler declares no source-map library), and asserts the
// original line AND column the map gives for the start of that statement.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { compile } from '../src/plugin';
import { injectStoreImports } from '../src/plugin-utils';
import { insertMapLines, type SourceMapJSON } from '../src/compiler/sourcemap';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';
import { compileSFC } from '../src/compiler/codegen';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Each generated line's segments, absolute: [generated column, source line (0-based), source column]. */
function decode(mappings: string): number[][][] {
    const lines: number[][][] = [];
    let srcLine = 0, srcCol = 0;
    for (const lineText of mappings.split(';')) {
        const segs: number[][] = [];
        let genCol = 0;
        for (const seg of lineText.split(',').filter(Boolean)) {
            const fields: number[] = [];
            let value = 0, shift = 0;
            for (const ch of seg) {
                const digit = B64.indexOf(ch);
                value += (digit & 31) << shift;
                if (digit & 32) { shift += 5; continue; }
                fields.push(value & 1 ? -(value >>> 1) : value >>> 1);
                value = 0; shift = 0;
            }
            genCol += fields[0];
            if (fields.length >= 4) { srcLine += fields[2]; srcCol += fields[3]; segs.push([genCol, srcLine, srcCol]); }
        }
        lines.push(segs);
    }
    return lines;
}

/** 1-based line and 0-based column of the one occurrence of `needle`. */
function at(text: string, needle: string): { line: number; column: number } {
    const i = text.indexOf(needle);
    expect(i, `not found: ${needle}`).toBeGreaterThan(-1);
    expect(text.indexOf(needle, i + 1), `found twice: ${needle}`).toBe(-1);
    const before = text.slice(0, i);
    return { line: before.split('\n').length, column: i - before.lastIndexOf('\n') - 1 };
}

/** Where the map sends a generated position: the closest segment at or before it on its line. */
function original(map: SourceMapJSON, line: number, column: number): { line: number; column: number } | null {
    const segs = decode(map.mappings)[line - 1] ?? [];
    let best: number[] | null = null;
    for (const s of segs) if (s[0] <= column) best = s;
    return best ? { line: best[1] + 1, column: best[2] } : null;
}

/**
 * Each [source text, generated text] pair: the map sends the second to where the first starts. A
 * `|` in the generated text marks the probed point inside it (the expression after a `${`).
 */
function probe(source: string, code: string, map: SourceMapJSON, pairs: [string, string][]): string[] {
    const wrong: string[] = [];
    for (const [src, genWithCursor] of pairs) {
        const want = at(source, src);
        const cursor = Math.max(0, genWithCursor.indexOf('|'));
        const gen = genWithCursor.replace('|', '');
        const start = at(code, gen);
        const g = { line: start.line, column: start.column + cursor };
        const got = original(map, g.line, g.column);
        if (!got || got.line !== want.line || got.column !== want.column) {
            wrong.push(`${src}: want ${want.line}:${want.column}, map gives ${got ? `${got.line}:${got.column}` : 'nothing'}`);
        }
    }
    return wrong;
}

const COUNTER = `<template>
  <button @click="inc">{{ count }}</button>
</template>

<script setup>
@prop start: number = 0;
let count = $signal(start);
function inc() {
  count++;
  if (count > 10) throw new Error('too many');
}
console.log('setup ran', count);
</script>
`;

const NESTED = `<template><p>{{ n }}</p></template>
<script setup>
let n = $signal(0);
const cfg = { render: 'grid', size: 2 };
const total = computed(() => {
  return n + cfg.size;
});
function boom() {
  throw new Error('boom');
}
</script>
`;

const HOISTED = `<template><p>{{ doubled }}</p></template>
<script setup>
let n = $signal(1);
function helper() { return 2; }
const doubled = $derived(n * 2);
console.log(doubled, helper());
</script>
`;

describe('the source map sends each setup statement to where it was written', () => {
    it('a counter: the signal, the handler and its body, a top-level call', () => {
        const { code, map } = compile(COUNTER, 'counter.pdx');
        expect(probe(COUNTER, code, map, [
            ['let count = $signal(start)', 'const __count = signal('],
            ['function inc()', 'function inc()'],
            ['count++;', '__count.set(__v => __v + 1);'],
            ['if (count > 10) throw', 'if (__count() > 10) throw'],
            ["console.log('setup ran'", "console.log('setup ran'"],
        ])).toEqual([]);
    });

    it('a setup holding `render:` and `});` of its own', () => {
        const { code, map } = compile(NESTED, 'nested.pdx');
        expect(probe(NESTED, code, map, [
            ["const cfg = { render: 'grid'", "const cfg = { render: 'grid'"],
            ['const total = computed(', 'const total = computed('],
            ['return n + cfg.size', 'return __n() + cfg.size'],
            ['function boom()', 'function boom()'],
            ["throw new Error('boom')", "throw new Error('boom')"],
        ])).toEqual([]);
    });

    it('a $derived the compiler moves above the code written before it', () => {
        const { code, map } = compile(HOISTED, 'hoisted.pdx');
        expect(probe(HOISTED, code, map, [
            ['const doubled = $derived(', 'const doubled = computed('],
            ['function helper()', 'function helper()'],
            ['console.log(doubled, helper())', 'console.log(doubled(), helper())'],
        ])).toEqual([]);
    });

    // ─── The template ───────────────────────────────────────
    // A handler, a bound attribute and an interpolation map to where they are written: the
    // attribute's name, the expression's start. A block maps to its condition or its collection.

    const TEMPLATE = `<template>
  <section>
    <button @click="save">Save</button>
    <input :value="name" />
    <p>{{ label }}</p>
    @for (items as item; track item) {
      <li>{{ item }}</li>
    }
    @if (show) {
      <em>shown</em>
    }
  </section>
</template>

<script setup>
let name = $signal('a');
let show = $signal(true);
const items = ['x'];
const label = $derived(name + '!');
function save() { throw new Error('nope'); }
</script>
`;

    it('the template path: a handler, a binding, interpolations, @for and @if', () => {
        const { code, map } = compile(TEMPLATE, 'tpl.pdx');
        expect(probe(TEMPLATE, code, map, [
            ['@click="save"', '@click=${|safeHandler(ctx.save'],
            [':value="name"', ':value=${|ctx.name}'],
            ['label }}', '<p>${|ctx.label}'],
            ['items as item', '${|eachRow('],
            ['item }}</li>', '<li>${|() => item()}'],
            ['show) {', '${|when('],
        ])).toEqual([]);
    });

    it('the inline path (a production build): the same six', () => {
        const { code, map } = compile(TEMPLATE, 'tpl.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(probe(TEMPLATE, code, map, [
            ['@click="save"', "__el1.addEventListener('click'"],
            [':value="name"', 'effect(() => { if ("value" in __el2)'],
            ['label }}', 'effect(()=>{__t4.data'],
            ['items as item', 'const __cf7=eachRow('],
            ['item }}</li>', 'effect(()=>{__t6.data'],
            ['show) {', 'const __cf9=when('],
        ])).toEqual([]);
    });

    // The marks are removed before the module leaves compile(): with or without a map, the module is
    // the same — in dev, in a production build, and on the production template path, whose binding
    // dedup compares expressions that carry their marks.
    it('the module is the same with a map and without one, in every mode', () => {
        const DEDUP = `<template>
  <button :disabled="count > 0" :hidden="count > 0">Save</button>
  @for (rows as r; track r) { <i :title="count > 0">{{ r }}</i> }
</template>
<script setup>
let count = $signal(0);
const rows = [1, 2];
</script>
`;
        for (const source of [TEMPLATE, DEDUP]) {
            for (const mode of [{}, { production: true, inlineBindings: true }, { production: true, inlineBindings: false }]) {
                const mapped = compile(source, 'same.pdx', [], undefined, mode).code;
                const d = parseSFC(source);
                const plain = compileSFC(d, parseTemplate(d.template!.content, 1), 'same.pdx', null, mode);
                expect(mapped, `mode ${JSON.stringify(mode)}`).toBe(plain);
            }
        }
        // The dedup ran on the template path, marks and all.
        expect(compile(DEDUP, 'same.pdx', [], undefined, { production: true, inlineBindings: false }).code).toContain('__bd_0');
    });

    // ─── Script modules ─────────────────────────────────────
    // A .pdx.ts module and a @store compile through compileScriptOnly, whose map must not be empty.

    it('a .pdx.ts module: its signal, its function and the statements inside it', () => {
        const MOD = `import { format } from './format';

let count = $signal(0);

export function bump() {
  count++;
  if (count > 3) throw new Error('too many');
  return format(count);
}
`;
        const { code, map } = compile(MOD, 'counter.pdx.ts');
        expect(code, 'an origin mark reached the module').not.toContain('@pdx-at');
        expect(probe(MOD, code, map, [
            ['let count = $signal(0)', 'const __count = signal('],
            ['export function bump()', 'export function bump()'],
            ['count++;', '__count.set(__v => __v + 1);'],
            ['if (count > 3) throw', 'if (__count() > 3) throw'],
            ['return format(count)', 'return format(__count())'],
        ])).toEqual([]);
    });

    // A .pdx.ts with no rune at all — data a page's sections share — is still a plain module: its
    // exports stay at the top level. The code generator reads it as the `<script setup>` it wraps it
    // in; read as a plain script it fell into the legacy mode and the module did not parse.
    it('a .pdx.ts with no rune stays a module with its exports at the top level', () => {
        const DATA = `// The team the sections show.
export const team = [
  { name: 'Ada' },
  { name: 'Grace' },
];
export function first() { return team[0]; }
`;
        // A production build too: the site's build is where this broke.
        for (const opts of [{}, { production: true, minify: true, inlineBindings: true }]) {
            const built = compile(DATA, 'state.pdx.ts', [], undefined, opts).code;
            const parse = ts.createSourceFile('state.js', built, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
            const diagnostics = (parse as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics ?? [];
            expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')), built).toEqual([]);
            expect(built, JSON.stringify(opts)).not.toContain('component(');
        }
        const { code, map } = compile(DATA, 'state.pdx.ts');
        expect(code).toMatch(/^export const team = \[/m);
        expect(probe(DATA, code, map, [
            ['export const team', 'export const team'],
            ['export function first()', 'export function first()'],
        ])).toEqual([]);
    });

    it('a @store: its signal, its derived (moved after the function) and the function', () => {
        const STORE = `@store cart;

let items = $signal([]);
const total = $derived(items.length);

function add(item) {
  items = items.concat(item);
  if (!item) throw new Error('no item');
}
`;
        const { code, map } = compile(STORE, 'cart.pdx.ts');
        expect(code, 'an origin mark reached the module').not.toContain('@pdx-at');
        expect(probe(STORE, code, map, [
            ['let items = $signal([])', 'const __items = signal('],
            ['const total = $derived(', 'const total = computed('],
            ['function add(item)', 'function add(item)'],
            ['items = items.concat(item)', '__items.set(prev => prev.concat(item))'],
            ["if (!item) throw new Error('no item')", "if (!item) throw new Error('no item')"],
        ])).toEqual([]);
    });

    it('auto-imports spliced in after compiling move the map with them', () => {
        const SRC = `<template><p>{{ count }}</p></template>
<script setup>
const cart = useCart();
let count = $signal(0);
console.log('cart', cart);
</script>
`;
        const { code, map } = compile(SRC, '/app/src/page.pdx');
        let shifted = map;
        const out = injectStoreImports(code, '/app/src/page.pdx', new Map([['cart', '/app/src/cart.pdx.ts']]),
            (line, count) => { shifted = insertMapLines(shifted, line, count); });
        expect(out, 'the fixture did not trigger an auto-import').toContain("import { useCart } from './cart.pdx.ts';");
        expect(probe(SRC, out, shifted, [
            ['const cart = useCart()', 'const cart = useCart()'],
            ["console.log('cart'", "console.log('cart'"],
        ])).toEqual([]);
    });
});
