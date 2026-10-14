// Every `pdx` example the site publishes compiles, and compiles clean.
//
// A declaration the analyzer does not accept fails the way this compiler fails such a line: in
// silence. `@form user {` needs a colon — `@form user: {` — and `@fetch users: '/api/users'` needs
// the method — `'GET /api/users'`. Without them nothing is emitted, nothing is said, and a page goes
// on building on identifiers that are never created.
//
// A reader copies these. So they are compiled here, as a reader would use them.
//
// A fence is a FRAGMENT: sometimes a script block, sometimes markup, sometimes both. It is assembled
// into the smallest file that carries it (tests/support/published-examples.ts), and a failure names
// the page and the fence. Compiling is the floor, and a compile that succeeds with a warning is not a
// clean example: `@fetch user: 'GET /u' : User` compiles and drops the type and its options (#39).
// Whether the result type-checks and its imports resolve is packages/lsp's
// published-examples-types.test.ts, which runs the editor's type check on the same examples.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { DOCS, docsExamples, resolveStub } from './support/published-examples';

/**
 * Examples that are there to show a diagnostic, with the code each must raise. The exception is
 * written down and checked — the example has to keep raising it — instead of silenced.
 */
const SHOWS_A_WARNING: Record<string, string[]> = {};

describe('the pdx examples the site publishes', () => {
    const all = docsExamples();
    const compileOf = (f: { source: string; filename: string }) => compile(f.source, `C:/docs/${f.filename}`, [], resolveStub);

    it('found them', () => {
        expect(all.length, 'no pdx fence found in the docs at all').toBeGreaterThan(30);
    });

    it('every one compiles', () => {
        const broken: string[] = [];
        for (const f of all) {
            try {
                compileOf(f);
            } catch (e) {
                broken.push(`${f.where}: ${String(e).split('\n')[0].slice(0, 90)}`);
            }
        }
        expect(broken, 'these published examples do not compile').toEqual([]);
    });

    it('every one compiles without a warning or an error, unless it is there to show one', () => {
        const found: string[] = [];
        for (const f of all) {
            let warnings;
            try {
                warnings = compileOf(f).warnings;
            } catch {
                continue; // the compile failure is reported above
            }
            const raised = warnings.filter(w => w.severity === 'warn' || w.severity === 'error').map(w => w.code);
            const expected = SHOWS_A_WARNING[f.where] ?? [];
            const unexpected = warnings.filter(w => (w.severity === 'warn' || w.severity === 'error') && !expected.includes(w.code));
            for (const w of unexpected) found.push(`${f.where}: ${w.code} — ${w.message.slice(0, 100)}`);
            for (const code of expected) if (!raised.includes(code)) found.push(`${f.where}: no longer raises ${code}, which it is listed to show`);
        }
        expect(found, 'these published examples raise diagnostics').toEqual([]);
    });

    // Compiling is a weaker claim than it sounds: `compile()` never parses what it emits. A
    // declaration the analyzer does not recognise is passed through as TEXT, so `@meta name 'x' 'y'`
    // ends up verbatim inside `setup(ctx) { … }`. The compile
    // is green and the module does not parse: an app that imports the page dies on a syntax error
    // pointing into generated code. So the emitted module is parsed here too.
    it('every one emits a module that parses', () => {
        const broken: string[] = [];
        for (const f of all) {
            let code: string;
            try {
                code = compileOf(f).code;
            } catch {
                continue; // the compile failure is reported above
            }
            // Strip the module syntax `new Function` cannot take. The compiler emits one import per
            // line, so this is exact, not a guess. `import.meta` is the other module-only syntax: an
            // expression, so an object in its place parses the same (the Worker pattern's
            // `new URL('./x.worker.ts', import.meta.url)`, #241).
            const body = code.split('\n').filter(l => !/^\s*(import|export)\s/.test(l)).join('\n')
                .replace(/\bimport\.meta\b/g, '({ url: "" })');
            try {
                new Function(body);
            } catch (e) {
                broken.push(`${f.where}: ${(e as Error).message}`);
            }
        }
        expect(broken, 'these published examples compile to a module that does not parse').toEqual([]);
    });

    it('a declaration the analyzer cannot read is not left as a silent no-op', () => {
        // The failure mode: the line compiles fine and wires nothing.
        // Compiling is therefore not enough — for these two declarations, the page's
        // example has to actually produce the call it promises.
        // A DECLARATION starts its line: `@fetch` inside a comment is a mention, not a promise.
        const forms = all.filter(f => f.where.startsWith('forms.md ') && /^\s*@form\s/m.test(f.source));
        expect(forms.length, 'forms.md declares no form any more').toBeGreaterThan(0);
        for (const f of forms) {
            expect(compileOf(f).code, `${f.where} declares a form that emits no createForm`).toMatch(/createForm\(/);
        }
        const fetches = all.filter(f => f.where.startsWith('data.md ') && /^\s*@fetch\s/m.test(f.source));
        expect(fetches.length, 'data.md declares no fetch any more').toBeGreaterThan(0);
        for (const f of fetches) {
            expect(compileOf(f).code, `${f.where} declares a fetch that emits no resource`).toMatch(/resource\(/);
        }
    });
});

// ─── compiler.md shows real output, and keeps showing it ─────────────────────────
//
// The page whose whole subject is the declaration→code transform carries a component and the module
// the compiler emits for it. A hand-pasted block is true the day it is pasted: when a rewrite such as
// `$derived` changes, nothing would notice the page going stale.
//
// So the page is held against `compile()`. The published block carries teaching comments the real
// output does not have; everything else must match, token for token.
describe('the output compiler.md publishes', () => {
    const page = readFileSync(join(DOCS, 'compiler.md'), 'utf-8').replace(/\r\n/g, '\n');

    /** Strip the annotations and the whitespace, keep the code. */
    const code = (text: string): string => text
        .split('\n')
        .map(l => l.replace(/^\s*\/\/.*$/, '').replace(/\s{2,}\/\/.*$/, ''))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();

    it('is what the compiler emits for the component shown above it', () => {
        const source = /```pdx\n([\s\S]*?)```/.exec(page);
        const published = /```js\n([\s\S]*?)```/.exec(page);
        expect(source, 'compiler.md no longer opens with a pdx example').not.toBeNull();
        expect(published, 'compiler.md no longer shows the generated module').not.toBeNull();

        const emitted = compile(source![1], 'C:/docs/counter.pdx').code;
        expect(code(published![1]), 'compiler.md shows output the compiler no longer produces')
            .toBe(code(emitted));
    });
});
