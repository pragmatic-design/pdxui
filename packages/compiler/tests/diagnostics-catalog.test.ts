// Every PDX_* code the tooling emits is in the catalog, and every catalog entry is true.
//
// ~50 codes are string literals spread over twenty files. The catalog says what each means; this
// keeps it honest: emitted ⇔ catalogued, and each entry either compiles an
// example that produces the code at the severity it states, or names the test that produces it.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DIAGNOSTICS, diagnosticUrl, explainDiagnostic } from '../src/diagnostics/catalog';
import { compile } from '../src/plugin';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate, type ValidationWarning } from '../src/compiler/validate';
import { positionWarnings } from '../src/compiler/position-warnings';

const REPO = join(__dirname, '..', '..', '..');
const CATALOG_DIR = join(REPO, 'packages', 'compiler', 'src', 'diagnostics');

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

/** Code → the source files that emit it: a quoted literal, or the `PDX_X:` a thrown message starts with. */
function emitted(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const pkg of ['compiler', 'cli', 'lsp']) {
        for (const file of walk(join(REPO, 'packages', pkg, 'src')).filter((f) => f.endsWith('.ts') && !f.startsWith(CATALOG_DIR))) {
            for (const m of readFileSync(file, 'utf8').matchAll(/(?<![A-Za-z_])(PDX_[A-Z0-9]+(?:_[A-Z0-9]+)*)(?=['"`:])/g)) {
                out.set(m[1], [...(out.get(m[1]) ?? []), relative(REPO, file).replace(/\\/g, '/')]);
            }
        }
    }
    return out;
}

const codes = emitted();
const entries = Object.entries(DIAGNOSTICS);

describe('the catalog and the emitters agree', () => {
    it('found the emitters, so the assertions below are not vacuous', () => {
        expect(codes.size, 'no PDX_* literal found under compiler/cli/lsp src').toBeGreaterThan(40);
    });

    it('every code emitted is in the catalog', () => {
        const missing = [...codes].filter(([c]) => !(c in DIAGNOSTICS)).map(([c, files]) => `${c} (${files[0]})`);
        expect(missing, 'emitted and not described: add them to packages/compiler/src/diagnostics/').toEqual([]);
    });

    it('every catalog entry is emitted somewhere', () => {
        const stale = entries.map(([c]) => c).filter((c) => !codes.has(c));
        expect(stale, 'described and emitted nowhere: remove them, or the emitter moved').toEqual([]);
    });
});

describe('every entry says how it is produced', () => {
    for (const [code, e] of entries) {
        it(code, () => {
            expect(e.summary && e.explanation && e.fix, `${code} has an empty summary, explanation or fix`).toBeTruthy();
            expect([e.example, e.reproducedIn, e.unreachable].filter(Boolean).length,
                `${code} needs an example, a reproducedIn test, or the reason it is unreachable`).toBeGreaterThan(0);
            if (e.reproducedIn) {
                const file = join(REPO, e.reproducedIn);
                expect(existsSync(file), `${code}: ${e.reproducedIn} does not exist`).toBe(true);
                expect(readFileSync(file, 'utf8'), `${code}: ${e.reproducedIn} does not name it`).toMatch(new RegExp(`\\b${code}\\b`));
            }
        });
    }
});

describe('the examples are true', () => {
    for (const [code, e] of entries.filter(([, e]) => e.example)) {
        it(`${code}: the bad example produces it at '${e.severity}', the good one does not`, () => {
            let bad: { code: string; severity: string }[] = [];
            try {
                bad = compile(e.example!.bad, 'example.pdx').warnings;
            } catch (err) {
                // A code that stops the compile names itself in the error.
                expect((err as Error).message, `${code}: the bad example threw something else`).toContain(code);
                expect(e.severity, `${code} stops the compile, so it is an error`).toBe('error');
                bad = [{ code, severity: 'error' }];
            }
            const hit = bad.find((w) => w.code === code);
            expect(hit, `${code}: the bad example does not produce it (got ${bad.map((w) => w.code).join(', ') || 'nothing'})`).toBeTruthy();
            expect(hit!.severity, `${code}: emitted at another severity than the catalog says`).toBe(e.severity);
            const good = compile(e.example!.good, 'example.pdx').warnings;
            expect(good.map((w) => w.code), `${code}: the good example still produces it`).not.toContain(code);
        });
    }
});

/** The findings of one file as `pdx check` sees them: compile()'s, or validate()'s when the compile stops. */
function findingsOf(source: string): ValidationWarning[] {
    try {
        return compile(source, 'example.pdx').warnings;
    } catch {
        const d = parseSFC(source);
        const ast = parseTemplate(d.template!.content, source.slice(0, d.template!.start).split('\n').length);
        const analysis = analyzeScript(d.script!.content, 'example.pdx', { setup: d.script!.setup });
        return positionWarnings(source, validate(analysis, ast, 'example.pdx'), analysis.body);
    }
}

// An entry that says it carries a fix, and has an example, is fixed into its good example.
describe('the fixes are true', () => {
    for (const [code, e] of entries.filter(([, e]) => e.fixable && e.example)) {
        it(`${code}: the fix turns the bad example into the good one`, () => {
            const w = findingsOf(e.example!.bad).find((x) => x.code === code);
            expect(w?.fix, `${code}: the bad example's finding carries no fix`).toBeDefined();
            let fixed = e.example!.bad;
            for (const edit of [...w!.fix!.edits].sort((a, b) => b.start - a.start)) {
                fixed = fixed.slice(0, edit.start) + edit.newText + fixed.slice(edit.end);
            }
            expect(fixed).toBe(e.example!.good);
        });
    }
});

describe('a code can be asked for', () => {
    it('explainDiagnostic returns the entry, and nothing for an unknown code', () => {
        expect(explainDiagnostic('PDX_RAW_INTERPOLATION')?.category).toBe('defect');
        expect(explainDiagnostic('PDX_NOPE')).toBeUndefined();
        expect(explainDiagnostic('toString')).toBeUndefined();
    });

    it('each code has an address on the diagnostics page', () => {
        expect(diagnosticUrl('PDX_RAW_INTERPOLATION')).toBe('https://pdxui.com/docs/diagnostics#pdx_raw_interpolation');
    });
});
