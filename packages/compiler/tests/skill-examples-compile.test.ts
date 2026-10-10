// Every .pdx example in the skills compiles.
//
// The skills are what an agent reads BEFORE it writes a .pdx, so a wrong example is copied, not
// read — `@for (job of jobs(); …)`, which the parser rejects, reaches an app that way. Checking that
// names are exported does not show that the examples run.
//
// This extracts every fenced ```html / ```pdx block that contains a .pdx construct from
// marketplace/plugins/*/skills/**/*.md, compiles it with the real compiler, and parses the output.
// A block that is deliberately partial says so in its fence (```html partial) and is skipped — and
// counted, so the skip list cannot grow in silence. The number compiled is asserted exactly: an
// extractor that finds nothing cannot pass, and a new example has to be counted in on purpose.
//
// An example that compiles with a warning is not clean either (#39): each is compiled with its
// diagnostics read. The extraction is tests/support/published-examples.ts, shared with the type
// check in packages/lsp.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { skillExamples, resolveStub } from './support/published-examples';

/**
 * Examples that are there to show a diagnostic, with the code each must raise. The exception is
 * written down and checked — the example has to keep raising it — instead of silenced.
 */
const SHOWS_A_WARNING: Record<string, string[]> = {};

const ALL = skillExamples();const COMPILED = ALL.filter(e => !e.partial);
const SKIPPED = ALL.filter(e => e.partial);

describe('the .pdx examples in the skills', () => {
    it('are found — the number is asserted, so a broken extractor cannot pass', () => {
        // 6 + the long-form recipe + the timed @await
        // + the cell/format columns, counted twice: once in tools/notes/pdx-data-grid.md,
        // the source, and once in the pdxui-data page the generator writes from it
        // + the "do not leave with unsaved work" page
        // + the @await retry by a new promise in the signal
        // + a route reading its params, and a form with its own validator
        // + the page with a «simulate failure» switch over a hand-written transport
        // + the day agenda per resource
        // + an error decided by code, with show-error, counted twice: in
        // tools/notes/pdx-form-field.md and in the pdxui-forms page written from it.
        // + a form section in its own .pdx injecting the form with useForm(): the framework does
        // not pass `form` down as a prop — `<pdx-form>` provides it and the child injects.
        // + the component pages' examples from the demos that use a block directive:
        // pdx-checkbox and pdx-chip (@for/@if), and pdx-error-boundary's two @try blocks.
        expect(COMPILED.map(e => e.where)).toHaveLength(23);
    });

    it('skips only what says it is partial — and nothing does today', () => {
        expect(SKIPPED.map(e => e.where)).toEqual([]);
    });

    for (const ex of COMPILED) {
        it(`compiles clean and produces valid JS — ${ex.where}`, () => {
            let result: ReturnType<typeof compile> | undefined;
            expect(() => { result = compile(ex.source, ex.filename, [], resolveStub); }, `${ex.where} does not compile`).not.toThrow();
            const expected = SHOWS_A_WARNING[ex.where] ?? [];
            const raised = result!.warnings.filter(w => w.severity === 'warn' || w.severity === 'error');
            expect(raised.filter(w => !expected.includes(w.code)).map(w => `${w.code} — ${w.message}`), `${ex.where} raises diagnostics`).toEqual([]);
            expect(expected.filter(c => !raised.some(w => w.code === c)), `${ex.where} no longer raises what it is listed to show`).toEqual([]);
            const body = result!.code.replace(/^import .*$/gm, '');
            expect(() => new Function(body), `${ex.where} compiles to invalid JS:\n${body}`).not.toThrow();
        });
    }
});
