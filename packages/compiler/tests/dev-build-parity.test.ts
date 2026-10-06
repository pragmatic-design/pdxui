// The dev server and the build compile the same .pdx to the same bindings.
//
// Inside an `@for` body, an identifier that is a plain constant must be a value in both — the dev
// server's `() => ctx.kindOptions`, never `vite build`'s signal CALL `() => e.kindOptions()`. Dev
// works; the production preview dies with `TypeError: e.kindOptions is not a function`, and the list
// disappears. It is the one class of defect a dev-only verification cannot see: only re-measuring
// on the build shows it.
//
// The dev server compiles with `{}`, the build with `{ production: true, minify, inlineBindings: false }` — plugin.ts, the
// `compile(…, { minify, componentDirs, production: !isDevMode })` call. Those are the two option sets
// compared here, and for every identifier kind the template can name inside a loop: a constant, a
// signal, a signal's method, a function call.

// ⚠️ `inlineBindings: false` throughout, and it is not a workaround: it names the path this
// file measures. A production build takes the INLINE path, and that path applies the
// loop-invariant hoist too — the transform both paths share is asserted on both,
// in `loop-invariant-both-paths.test.ts`. What is the template path's own is the binding
// deduplication and the escaping of the tagged template, which is what the flag pins here.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const MODES = {
    dev: {},
    build: { production: true, minify: false, inlineBindings: false },
    'build, minified': { production: true, minify: true, inlineBindings: false },
} as const;

const SETUP = [
    "import { signal } from '@pdxui/core';",
    'let docs = $signal([{ id: 1 }]);',
    'const kindOptions = [{ value: "a", label: "A" }];',
    'let picked = $signal("a");',
    // A signal OBJECT, not the rune: its methods are the API.
    'const block = signal(false);',
    'function labelOf(doc) { return String(doc.id); }',
].join('\n  ');

function compileWith(template: string, opts: object): string {
    const source = `<template>\n${template}\n</template>\n<script setup>\n  ${SETUP}\n</script>`;
    return compile(source, 'parity.pdx', [], undefined, opts).code;
}

/** Every place `name` appears in the output, with a little context, for the failure message. */
function around(code: string, name: string): string {
    return (code.match(new RegExp(`.{0,50}\\b${name}\\b.{0,30}`, 'g')) ?? ['(absent)']).join('\n    ');
}

/** Is `name` CALLED anywhere in the output — `name(` with only whitespace between? */
function isCalled(code: string, name: string): boolean {
    return new RegExp(`\\b${name}\\s*\\(`).test(code);
}

const inLoop = (inner: string) => `@for (docs as doc; track doc.id) {\n  ${inner}\n}`;

for (const [mode, opts] of Object.entries(MODES)) {
    describe(`inside @for — ${mode}`, () => {
        it('a plain constant is read, never called', () => {
            const code = compileWith(inLoop('<pdx-select :options="kindOptions"></pdx-select>'), opts);
            expect(isCalled(code, 'kindOptions'),
                `kindOptions is a const array and was emitted as a call:\n    ${around(code, 'kindOptions')}`)
                .toBe(false);
        });

        if (mode !== 'dev') {
            // Build only. The dev server passes a signal to an attribute BY REFERENCE —
            // `:value=${ctx.picked}` — and the runtime unwraps it; the build hoists and calls it. Both
            // are correct. What matters is that the build still hoists real signals after the fix,
            // so "hoist nothing" cannot pass the constant test above.
            it('a signal IS hoisted and called — the control', () => {
                const code = compileWith(inLoop('<pdx-select :value="picked"></pdx-select>'), opts);
                expect(code, `picked is a signal and was not hoisted:\n    ${around(code, 'picked')}`)
                    .toMatch(/__li_picked\s*=\s*computed\(\s*\(\)\s*=>\s*ctx\.picked\(\)\s*\)/);
            });
        }

        it('a function the author calls stays exactly one call', () => {
            const code = compileWith(inLoop('<span>{{ labelOf(doc) }}</span>'), opts);
            expect(code, `labelOf was double-called:\n    ${around(code, 'labelOf')}`)
                .not.toMatch(/labelOf\s*\(\s*\)\s*\(/);
            expect(isCalled(code, 'labelOf')).toBe(true);
        });

        it("a signal object's method is called on the object, not on its value", () => {
            // `block` is `signal(false)`: `block.set(true)` is its API. Called on the VALUE — `block()`
            // or `__li_block()` — it is `false.set`, a TypeError at click time, in production only.
            // (Not tested with a `$signal`: there the name means the value in both modes, by design.)
            const code = compileWith(inLoop('<button @click="block.set(true)">x</button>'), opts);
            expect(code, `block.set was called on the value:\n    ${around(code, 'block')}`)
                .not.toMatch(/(?:__li_)?block\s*\(\s*\)\s*\.\s*set/);
            expect(code).toMatch(/block\.set\(true\)/);
        });
    });
}

describe('outside @for, as the baseline the loop must match', () => {
    // If these ever differ the loop is not the only place the two paths disagree — widen the fix.
    for (const [mode, opts] of Object.entries(MODES)) {
        it(`a plain constant is read, never called — ${mode}`, () => {
            const code = compileWith('<pdx-select :options="kindOptions"></pdx-select>', opts);
            expect(isCalled(code, 'kindOptions'), around(code, 'kindOptions')).toBe(false);
        });
    }
});
