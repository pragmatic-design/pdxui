// `@await (x)` compiles to a switch that knows what a promise is.
//
// Compiled to `when(() => x, body, loading)` it would be a truthiness switch, and a Promise is always
// truthy, so the body would render at once and forever — pending or rejected. It compiles to core's
// `awaitBlock` (#145), which decides the branch from the awaited value: a promise by whether it has
// settled, a source by its state, a plain value by data.md's E5. What it does at runtime is tested in
// core (`await-block.test.ts`, including a new promise in the signal leaving @error); this is that the
// compiler emits it, on every path, with the import that makes it resolve.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const PATHS = {
    dev: {},
    build: { production: true },
    'production inline': { production: true },
} as const;

function compileTemplate(template: string, opts: object): string {
    const source = `<template>\n${template}\n</template>\n<script>\n  let job = $signal(null);\n  let ready = $signal(false);\n</script>`;
    return compile(source, 'await.pdx', [], undefined, opts).code;
}

function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

for (const [name, opts] of Object.entries(PATHS)) {
    describe(`@await — ${name}`, () => {
        it('compiles to awaitBlock over the awaited expression, imported', () => {
            const code = compileTemplate('@await (job) { <b>done</b> } @loading { <i>wait</i> }', opts);
            parses(code);
            expect(code, 'the expression reaches a truthiness switch').toMatch(/awaitBlock\(\(\)=>ctx\.job\(\),/);
            expect(code, 'awaitBlock is called but never imported').toMatch(/import\s*\{[^}]*\bawaitBlock\b[^}]*\}\s*from\s*['"]@pdxui\/core['"]/);
            expect(code, 'the alpha truthiness switch is still emitted').not.toMatch(/\bwhen\(/);
        });

        it('hands the @error branch to it, with the error and the retry, which is where a rejection lands', () => {
            const code = compileTemplate('@await (job) { <b>done</b> } @loading { <i>wait</i> } @error (e) { <u>{{ e.message }}</u> }', opts);
            parses(code);
            expect(code).toMatch(/awaitBlock\([^]*,\(e,retry\)=>\{[^]*\}\);/);
        });

        it('control — @await without @error passes no error branch', () => {
            const code = compileTemplate('@await (job) { <b>done</b> } @loading { <i>wait</i> }', opts);
            expect(code).toMatch(/awaitBlock\([^]*,null\);/);
        });

        it('passes the timing of a timed @await', () => {
            // The syntax is the parser's own: an options block after the condition.
            const code = compileTemplate('@await (job) { minMs: 200 } { <b>done</b> } @loading { <i>wait</i> }', opts);
            parses(code);
            expect(code).toMatch(/awaitBlock\([^]*,\{minMs:200\}\);/);
        });
    });
}
