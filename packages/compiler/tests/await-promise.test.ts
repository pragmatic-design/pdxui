// `@await (x)` compiles to a switch that knows what a promise is.
//
// Compiled to `when(() => x, body, loading)` alone it would be a truthiness switch, and a Promise is
// always truthy, so the body would render at once and forever — pending or rejected. The condition is
// wrapped in core's `awaitReady`, which is false while a promise is pending, true once it fulfils,
// throws its reason when it rejects (into the `@error` boundary), and is plain truthiness for anything
// else. What it does at runtime is tested in core (`await-ready.test.ts`); this is that the compiler
// emits it, on both paths, with the import that makes it resolve.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const PATHS = {
    dev: {},
    build: { production: true },
    'production inline': { production: true, inlineBindings: true },
} as const;

function compileTemplate(template: string, opts: object): string {
    const source = `<template>\n${template}\n</template>\n<script setup>\n  let job = $signal(null);\n  let ready = $signal(false);\n</script>`;
    return compile(source, 'await.pdx', [], undefined, opts).code;
}

function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

for (const [name, opts] of Object.entries(PATHS)) {
    describe(`@await — ${name}`, () => {
        it('wraps the condition in awaitReady, so a promise is waited for', () => {
            const code = compileTemplate('@await (job) { <b>done</b> } @loading { <i>wait</i> }', opts);
            parses(code);
            expect(code, 'the condition reaches when() raw — a promise is truthy, the body renders at once')
                .toMatch(/awaitReady\(/);
            expect(code, 'awaitReady is called but never imported').toMatch(/import\s*\{[^}]*\bawaitReady\b[^}]*\}\s*from\s*['"]@pdxui\/core['"]/);
        });

        it('keeps the @error branch around it, which is where a rejection lands', () => {
            const code = compileTemplate('@await (job) { <b>done</b> } @loading { <i>wait</i> } @error (e) { <u>{{ e.message }}</u> }', opts);
            parses(code);
            expect(code).toMatch(/awaitReady\(/);
            expect(code).toMatch(/errorBoundary\(/);
        });

        it('@error resets on the awaited expression: a new promise in the signal leaves it', () => {
            // Without resetOn the boundary stays on @error for good, and the documented retry —
            // put a new promise in the signal — does nothing.
            const code = compileTemplate('@await (job) { <b>done</b> } @loading { <i>wait</i> } @error (e) { <u>{{ e.message }}</u> }', opts);
            parses(code);
            expect(code).toMatch(/resetOn\s*:\s*\(\)\s*=>\s*ctx\.job\(\)/);
            // The switch is built inside the content function, so rendering it again awaits anew:
            // `errorBoundary(() => … awaitReady(…) …` before the fallback's parameters.
            expect(code).toMatch(/errorBoundary\(\(\)\s*=>\s*\{?[^]*?awaitReady\([^]*?\(e,\s*retry\)\s*=>/);
        });

        it('control — @await without @error has no boundary and no resetOn', () => {
            const code = compileTemplate('@await (job) { <b>done</b> } @loading { <i>wait</i> }', opts);
            expect(code).not.toContain('resetOn');
        });

        it('wraps a timed @await too', () => {
            // The awaitTimed branch builds its own condition; it must not skip the wrapper.
            // The syntax is the parser's own (template.ts:809): an options block after the condition.
            const code = compileTemplate('@await (job) { minMs: 200 } { <b>done</b> } @loading { <i>wait</i> }', opts);
            parses(code);
            expect(code).toMatch(/awaitTimed\(/);
            expect(code).toMatch(/awaitReady\(/);
        });
    });
}
