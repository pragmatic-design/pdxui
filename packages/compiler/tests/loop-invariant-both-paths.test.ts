// A loop-invariant read is hoisted on BOTH render paths.
//
// The compiler has two ways to produce a render: the tagged template (`html``) and the inline one,
// which writes imperative DOM calls and is the default in a production build. The second does not
// inherit the first one's loop-invariant hoisting by itself:
//
//     @for (items as e; track e.id) { <button @click="save">{{ e.count ?? count }}</button> }
//
//       template   const __li_count = computed(() => ctx.count())   ← one, outside the loop
//       inline     effect(() => { … e().count ?? ctx.count() })     ← one PER ROW
//
// Which is a real difference and not only a shape: each row's effect subscribes to `count` itself,
// so a 1500-row list puts 1500 entries in that signal's subscriber set where the other path puts
// one, and a change to `count` re-reads the signal 1500 times instead of recomputing once.
//
// This file is the probe, as a test: the same source through both paths, asserting the hoist in
// each. It is what says the two paths agree, which has to hold because the inline one is what a
// build uses.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const LOOP = `<template>
  @for (items as e; track e.id) {
    <button @click="save">{{ e.count ?? count }}</button>
  }
</template>
<script setup>
let count = $signal(0);
let items = $signal([]);
function save() {}
</script>`;

const build = (source: string, inlineBindings: boolean) =>
    compile(source, 'probe.pdx', undefined, undefined, { production: true, inlineBindings }).code;

/**
 * Hands the generated module to the JavaScript parser, which is the only judge of whether a name was
 * declared twice in one scope. Module syntax cannot go through `new Function`, so the imports and the
 * export are removed first — neither carries a declaration this file is about.
 */
const parse = (code: string): void => {
    const asScript = code
        .replace(/^\s*import\b[^\n]*$/gm, '')
        .replace(/^\s*export default\b/m, 'const __mod =')
        .replace(/^\s*export\b(?= (const|function|class|let))/gm, '');
    new Function(asScript);
};

describe('a signal read that does not depend on the row', () => {
    it('is hoisted into one computed on the TEMPLATE path', () => {
        const code = build(LOOP, false);
        expect(code, 'the template path stopped hoisting').toContain('const __li_count = computed(');
        expect(code, 'the hoisted read is not used in the row').toContain('__li_count()');
    });

    it('and on the INLINE path, which is what a production build uses', () => {
        const code = build(LOOP, true);
        // The name carries the generator's counter, which is what keeps a nested loop's hoist from
        // colliding with its parent's; what the assertion is about is the ONE computed.
        expect(code, 'every row reads the signal itself: 1500 rows, 1500 subscriptions')
            .toMatch(/const __li\d*_count\s*=\s*computed\(/);
        expect(code).toMatch(/__li\d*_count\(\)/);
    });

    it('control — the ROW\'s own read is left alone on both paths', () => {
        // `e().count` depends on the row and must not be lifted out of it. A hoist that took this
        // with it would render the first row's value in every row.
        for (const inline of [false, true]) {
            const code = build(LOOP, inline);
            expect(code, `inlineBindings: ${inline} — the row's own read was hoisted`)
                .toMatch(/e\(\)\.count/);
            expect(code).not.toMatch(/__li_e\b/);
        }
    });

    it('control — a handler passed by reference is never hoisted, on either path', () => {
        // `safeHandler(ctx.save, …)`: hoisting a function into `computed(() => ctx.save())` would
        // CALL it at render. The template path excludes handlers, and the inline path must
        // not apply the transform without the exclusion.
        for (const inline of [false, true]) {
            const code = build(LOOP, inline);
            expect(code, `inlineBindings: ${inline} — the click handler was hoisted and invoked`)
                .not.toContain('__li_save');
        }
    });

    it('control — nothing is hoisted in a dev build, on either path', () => {
        // The hoist is a production transform: in dev the two paths read the signal where the
        // author wrote it, which is what makes a stack trace and a debugger legible.
        for (const inline of [false, true]) {
            const code = compile(LOOP, 'probe.pdx', undefined, undefined,
                { production: false, inlineBindings: inline }).code;
            expect(code, `inlineBindings: ${inline} — a dev build hoisted`).not.toContain('__li_');
        }
    });

    it('two loops over the same signal produce a module that parses', () => {
        // The shape that broke a real build: two @for blocks in one block, each with a read that
        // does not depend on its row. The template path wraps every hoist in its own IIFE, so two
        // `const __li_unit` are two scopes; the inline path writes them side by side in ONE, which
        // is `Identifier "__li_draft" has already been declared` — the builder stopped compiling.
        // Asserted as the engine sees it: the generated module is handed to the parser.
        const siblings = `<template>
  @for (sizes as s; track s) { <i>{{ s }}{{ unit }}</i> }
  @for (colors as c; track c) { <b>{{ c }}{{ unit }}</b> }
</template>
<script setup>
let unit = $signal('px');
let sizes = $signal([]);
let colors = $signal([]);
</script>`;
        for (const inline of [false, true]) {
            const code = build(siblings, inline);
            expect(code, `inlineBindings: ${inline} — nothing was hoisted`).toContain('__li');
            expect(() => parse(code), `inlineBindings: ${inline}`).not.toThrow();
        }
    });

    it('control — a hoisted read is never rewritten into its own initializer', () => {
        // A nested loop hoists inside the outer loop's row function, and the outer one then rewrites
        // the same `ctx.NAME()` across that body. If both pick the same name the inner computed ends
        // up reading itself — `computed(() => __li_x())` as the initializer OF `__li_x`, which is a
        // TDZ throw the first time a row renders, and no test of a single loop can see it.
        const nested = `<template>
  @for (groups as g; track g.id) {
    <p>{{ g.label }}{{ unit }}</p>
    @for (g.items as it; track it.id) { <i>{{ it.name }}{{ unit }}</i> }
  }
</template>
<script setup>
let unit = $signal('px');
let groups = $signal([]);
</script>`;
        for (const inline of [false, true]) {
            const code = build(nested, inline);
            const self = [...code.matchAll(/const (__li\w+)\s*=\s*computed\(\(\)\s*=>\s*([^)]*)\)/g)]
                .filter(m => m[2].includes(m[1]));
            expect(self.map(m => m[0]), `inlineBindings: ${inline} — a computed initialises itself`)
                .toEqual([]);
            // The inner loop takes it; the outer one sees it is taken and leaves it alone. One
            // computed for the signal, which is the same answer the template path has given since
            // the nested-hoist regression in `fix-batch-codegen.test.ts`.
            const declared = [...code.matchAll(/const __li\w*_unit\s*=/g)];
            expect(declared.length, `inlineBindings: ${inline} — hoisted ${declared.length} times`)
                .toBe(1);
        }
    });

    it('control — a loop with no invariant read emits no computed at all', () => {
        const noInvariant = LOOP.replace('{{ e.count ?? count }}', '{{ e.count }}');
        for (const inline of [false, true]) {
            const code = build(noInvariant, inline);
            expect(code, `inlineBindings: ${inline} — something was hoisted out of nothing`)
                .not.toContain('__li_');
        }
    });
});
