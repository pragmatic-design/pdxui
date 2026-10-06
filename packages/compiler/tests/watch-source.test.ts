// `$watch(x, cb)` hands `watch` the thing to observe, not what it reads once.
//
// Put through the same rewrite as every other read in a script, `$watch(count, cb)` would compile to
// `watch(__count(), cb)`: the value in setup, a constant. The callback would never fire, and with
// `{ immediate: true }` a watched array or string throws `c is not a function` at mount. A `$watch`
// over a plain `const`, which the rewriter leaves alone, does not show it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { signal, batch } from '../../core/src/reactivity/signal';
import type { Signal } from '../../core/src/utils/types';
import { watch } from '../../core/src/reactivity/watch';

function watchSource(script: string, opts: object = {}): string {
    const source = `<template><div>x</div></template>\n<script setup>\n${script}\n</script>`;
    const code = compile(source, 'watch-source.pdx', [], undefined, opts).code;
    // Match: `watch(<source>, (` — the source up to the callback's parameter list.
    const m = code.match(/\bwatch\((.*?),\s*\(/);
    expect(m, `no watch() call in:\n${code}`).not.toBeNull();
    return m![1].trim();
}

for (const [name, opts] of Object.entries({ dev: {}, build: { production: true } })) {
    describe(`$watch source — ${name}`, () => {
        it('a $signal is watched as a getter, not read once', () => {
            const src = watchSource(`let count = $signal(0);\n$watch(count, (n) => console.log(n));`, opts);
            expect(src, 'the signal is read in setup: watch() is given a constant').not.toMatch(/^__count\(\)$/);
            expect(src).toMatch(/^\(\)\s*=>\s*__count\(\)$/);
        });

        it('a $derived is watched as a getter, not read once', () => {
            const src = watchSource(`let count = $signal(0);\nconst doubled = $derived(count * 2);\n$watch(doubled, (n) => console.log(n), { immediate: true });`, opts);
            // A $derived keeps its own name; a $signal becomes `__name`.
            expect(src).toMatch(/^\(\)\s*=>\s*doubled\(\)$/);
        });

        it('an expression over reactive reads is watched as a whole', () => {
            const src = watchSource(`let a = $signal(1);\nlet b = $signal(2);\n$watch(a + b, (n) => console.log(n));`, opts);
            expect(src).toMatch(/^\(\)\s*=>\s*__a\(\)\s*\+\s*__b\(\)$/);
        });

        it('control — a plain const is passed as it is', () => {
            // Wrapping it would hand watch() the signal function as the VALUE it watches.
            const src = watchSource(`const ticks = makeTicks();\n$watch(ticks, (n) => console.log(n));`, opts);
            expect(src).toBe('ticks');
        });

        it('control — a member of a plain const is passed as it is', () => {
            const src = watchSource(`const source = makeSource();\n$watch(source.filter, (f) => console.log(f));`, opts);
            expect(src).toBe('source.filter');
        });

        // An array literal is a LIST of sources, which watch() compares one by one. Wrapped whole it
        // would be one getter returning a new array each run: always «changed».
        it('an array of reactive reads is an array of getters, not one getter returning an array', () => {
            const src = watchArraySource(`let a = $signal(1);\nlet b = $signal(2);\n$watch([a, b], ([x, y]) => console.log(x, y));`, opts);
            expect(src).toMatch(/^\[\s*\(\)\s*=>\s*__a\(\),\s*\(\)\s*=>\s*__b\(\)\s*\]$/);
        });

        it('in an array, an element the rewrite leaves alone is passed as it is', () => {
            const src = watchArraySource(`let a = $signal(1);\nconst ticks = makeTicks();\n$watch([a, ticks], ([x, t]) => console.log(x, t));`, opts);
            expect(src).toMatch(/^\[\s*\(\)\s*=>\s*__a\(\),\s*ticks\s*\]$/);
        });

        // A source that is ALREADY a getter — the form Vue and core's own `watch(getter, cb)` teach — is
        // a getter after the rewrite too. Wrapped again it would be `() => () => x()`: watch() compares the
        // inner arrow, never the value, and the callback never runs.
        it('a getter over a $signal stays one getter', () => {
            const src = watchSource(`let count = $signal(0);\n$watch(() => count, (n) => console.log(n));`, opts);
            expect(src).toMatch(/^\(\)\s*=>\s*__count\(\)$/);
        });

        it('a getter over a @prop stays one getter', () => {
            const src = watchSource(`@prop open: boolean = false;\n$watch(() => open, (o) => console.log(o));`, opts);
            expect(src).toMatch(/^\(\)\s*=>\s*open\(\)$/);
        });

        it('a getter over an expression stays one getter', () => {
            const src = watchSource(`let a = $signal(1);\nlet b = $signal(2);\n$watch(() => a + b, (n) => console.log(n));`, opts);
            expect(src).toMatch(/^\(\)\s*=>\s*__a\(\)\s*\+\s*__b\(\)$/);
        });

        it('a function expression over a $signal stays one getter', () => {
            const src = watchSource(`let count = $signal(0);\n$watch(function () { return count; }, (n) => console.log(n));`, opts);
            expect(src).toMatch(/^function \(\) \{ return __count\(\); \}$/);
        });

        it('control — an index into an array is one source, not a list', () => {
            const src = watchSource(`let rows = $signal([1]);\n$watch(rows[0], (r) => console.log(r));`, opts);
            expect(src).toMatch(/^\(\)\s*=>\s*__rows\(\)\[0\]$/);
        });
    });
}

/** The source of the one `watch([…], …)` call: the bracketed list, up to the callback. */
function watchArraySource(script: string, opts: object = {}): string {
    const source = `<template><div>x</div></template>\n<script setup>\n${script}\n</script>`;
    const code = compile(source, 'watch-source.pdx', [], undefined, opts).code;
    // Match: `watch([ … ], ` — the source, up to the comma before the callback.
    const m = code.match(/\bwatch\((\[.*?\]),\s*\(/);
    expect(m, `no watch([…]) call in:\n${code}`).not.toBeNull();
    return m![1].trim();
}

// What the emitted source DOES, against core's own watch(): the callback runs when a value changes,
// with the values it had — and not when its effect runs again over the same values.
describe('$watch([a, b]) at runtime', () => {
    function run(source: string, a: Signal<number>, b: Signal<number>, calls: unknown[][]) {
        const make = new Function('watch', '__a', '__b', 'calls', `return watch(${source}, (n, o) => calls.push([n, o]));`);
        return make(watch, a, b, calls);
    }

    for (const [name, opts] of Object.entries({ dev: {}, build: { production: true } })) {
        it(`${name}: a change calls back once with the new and the old values; a re-run over equal values does not`, () => {
            // Whatever the compiler emits as the source — one getter or a list — up to the `(v) =>`
            // callback, so this row runs either form alike.
            const source = `<template><div>x</div></template>\n<script setup>\nlet a = $signal(1);\nlet b = $signal(2);\n$watch([a, b], (v) => console.log(v));\n</script>`;
            const m = compile(source, 'watch-source.pdx', [], undefined, opts).code.match(/\bwatch\((.*), \(v\) =>/);
            expect(m, 'no watch() call').not.toBeNull();
            const src = m![1];
            const a = signal(1), b = signal(2);
            const calls: unknown[][] = [];
            run(src, a, b, calls);

            a.set(5);
            expect(calls).toEqual([[[5, 2], [1, 2]]]);

            // The effect runs again — `a` was written — and ends where it began.
            batch(() => { a.set(6); a.set(5); });
            expect(calls, 'called back over values that did not change').toHaveLength(1);
        });
    }
});

// A prop read only inside a `$watch` — its source, its callback or its options — is declared in
// setup like any other prop the script reads.
//
// The reads are rewritten to `storeKey()`, and the accessor `const storeKey = ctx.storeKey` is
// emitted only for a prop the body, an effect, a lifecycle hook, a signal, a derived or a watch
// mentions: without the watches in that list the component throws `storeKey is not defined` in
// setup and renders nothing — as a list header whose store key is read once the grid arrives does.
describe('a prop read only in a $watch', () => {
    const compiled = (script: string) =>
        compile(`<template><div>x</div></template>\n<script setup>\n${script}\n</script>`, 'watch-prop.pdx').code;

    it('in the callback, it is declared', () => {
        const code = compiled(`@prop storeKey: string = '';\n@prop grid: object = null;\n$watch(grid, (el) => console.log(el, storeKey));`);
        expect(code).toContain('storeKey()');
        expect(code, 'read but never declared').toMatch(/const storeKey = ctx\.storeKey;/);
    });

    it('in the source, it is declared', () => {
        const code = compiled(`@prop grid: object = null;\n$watch(grid, (el) => console.log(el));`);
        expect(code).toMatch(/const grid = ctx\.grid;/);
    });

    it('in the options, it is declared', () => {
        const code = compiled(`@prop eager: boolean = false;\nlet n = $signal(0);\n$watch(n, (v) => console.log(v), { immediate: eager });`);
        expect(code).toMatch(/const eager = ctx\.eager;/);
        // Read, not handed over: the accessor itself is a function, and a function is truthy.
        expect(code).toMatch(/\{ immediate: eager\(\) \}/);
    });

    it('control — a prop nothing reads gets no accessor', () => {
        const code = compiled(`@prop unused: string = '';\nlet n = $signal(0);\n$watch(n, (v) => console.log(v));`);
        expect(code).not.toMatch(/const unused = ctx\.unused;/);
    });
});
