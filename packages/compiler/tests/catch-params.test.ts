// `@catch (err, retry)` compiles to a valid function.
//
// A parser that keeps everything between the parentheses as one opaque "error variable", with every
// generator appending its own `, retry` after it, turns `@catch (err, retry)` — the literal example of
// the recipe "A panel that can fail without taking the screen with it" — into
// `errorBoundary(…, (err, retry, retry) => …)`: a duplicate parameter, a SyntaxError in an ES module,
// and an application that does not load at all. Blank page, nothing in the console.
//
// Both generators are covered: the html`` path the dev server uses and the inline DOM path of the
// production build. Parsing the output is the assertion that matters — an arrow function rejects a
// duplicate parameter even outside strict mode, so `new Function` is enough of a judge.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';

const RECIPES = join(__dirname, '../../../marketplace/plugins/pdxui/skills/pdxui/references/recipes.md');

const PATHS = {
    dev: {},
    'production inline': { production: true, inlineBindings: true },
} as const;

function compileTemplate(template: string, opts: object): string {
    const source = `<template>\n${template}\n</template>\n<script setup>\n  let ready = $signal(false);\n</script>`;
    return compile(source, 'catch-params.pdx', [], undefined, opts).code;
}

function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

/** The parameter list of the fallback handed to errorBoundary, as emitted.
 *  ⚠️ A NON-EMPTY list of names: the first version matched the `() =>` of the `when(() => …)` nested
 *  inside `@await`'s boundary and read '' — a red that said nothing about the parameters. */
function fallbackParams(code: string): string {
    const m = code.match(/errorBoundary\([\s\S]*?,\s*\(([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)\)\s*=>/);
    expect(m, 'no errorBoundary fallback found in the output').not.toBeNull();
    return m![1].replace(/\s+/g, '');
}

for (const [name, opts] of Object.entries(PATHS)) {
    describe(`@try / @catch parameters — ${name}`, () => {
        it('one name: the error, and the retry function is still called retry', () => {
            const code = compileTemplate('@try { <div>ok</div> } @catch (e) { <button @click="retry()">again</button> }', opts);
            parses(code);
            expect(fallbackParams(code)).toBe('e,retry');
        });

        it('two names, the second being retry: the form the recipe shows', () => {
            const code = compileTemplate('@try { <div>ok</div> } @catch (err, retry) { <button @click="retry()">again</button> }', opts);
            parses(code);
            expect(fallbackParams(code)).toBe('err,retry');
        });

        it('two names: the second one IS the retry function, under the author\'s name', () => {
            // The control for the case above: without it, "always emit `err,retry`" would pass by
            // ignoring the author's second name altogether.
            const code = compileTemplate('@try { <div>ok</div> } @catch (err, again) { <button @click="again()">again</button> }', opts);
            parses(code);
            expect(fallbackParams(code)).toBe('err,again');
        });
    });

    describe(`@await / @error parameters — ${name}`, () => {
        it('two names in @error, the second being retry', () => {
            const code = compileTemplate('@await (ready) { <div>done</div> } @error (err, retry) { <button @click="retry()">again</button> }', opts);
            parses(code);
            expect(fallbackParams(code)).toBe('err,retry');
        });

        it('one name in @error still gets retry', () => {
            const code = compileTemplate('@await (ready) { <div>done</div> } @error (e) { <div>bad</div> }', opts);
            parses(code);
            expect(fallbackParams(code)).toBe('e,retry');
        });
    });
}

describe('the recipe an app copies', () => {
    // The block is read from recipes.md, not retyped here: a copy in the test would keep passing the
    // day someone edits the recipe into something that does not compile. (Every example in every
    // skill is checked too; this one stays because it is the one an app copies verbatim.)
    // CRLF normalised: a Windows checkout (core.autocrlf) writes \r\n, and the fence below needs \n.
    const md = readFileSync(RECIPES, 'utf-8').replace(/\r\n/g, '\n');
    const block = (md.match(/```html\n(@try \{[\s\S]*?\n\})\n```/) ?? [])[1];

    it('still contains the error-boundary block, with two names in its @catch', () => {
        expect(block, 'the @try block is gone from recipes.md').toBeDefined();
        expect(block).toMatch(/@catch \(err, retry\)/);
    });

    for (const [name, opts] of Object.entries(PATHS)) {
        it(`compiles to valid JavaScript — ${name}`, () => {
            const source = `<template>\n${block}\n</template>\n<script setup>\n  let agencies = $signal([]);\n</script>`;
            const code = compile(source, 'recipe.pdx', [], undefined, opts).code;
            parses(code);
            expect(fallbackParams(code)).toBe('err,retry');
        });
    }
});

describe('a parameter list the boundary cannot honour is refused at compile time', () => {
    // Refused, not "fixed up": a third name has nothing to bind to, and a name that is not an
    // identifier is a typo — both would otherwise surface as a blank page at runtime.
    it('three names', () => {
        expect(() => compileTemplate('@try { <div>ok</div> } @catch (a, b, c) { <div>x</div> }', {}))
            .toThrow(/@catch.*at most two/i);
    });

    it('a name that is not an identifier', () => {
        expect(() => compileTemplate('@try { <div>ok</div> } @catch (1err) { <div>x</div> }', {}))
            .toThrow(/@catch.*not a valid name/i);
    });

    it('the same name twice', () => {
        expect(() => compileTemplate('@try { <div>ok</div> } @catch (e, e) { <div>x</div> }', {}))
            .toThrow(/@catch.*same name/i);
    });
});
