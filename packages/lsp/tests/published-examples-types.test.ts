// The published .pdx examples type-check, and their imports resolve (#39).
//
// packages/compiler compiles every example in the site's docs and the skills, and fails on a
// diagnostic. Compiling does not typecheck and does not resolve imports: `import { mutate } from
// '@pdxui/core'` compiles, and no package exports it. This runs the check `pdx check --types` runs —
// the editor's projection of script and template, one TypeScript program — over the same examples,
// as files of the site package, so `@pdxui/*` resolves to the workspace packages through its
// node_modules and its tsconfig.
//
// A TypeScript error fails the example, with its code and its line; a name a package does not
// export is one of them (2305). A module that does not exist is not: the editor drops 2307 and 2792
// as noise in a .pdx (src/capabilities/ts-diagnostics.ts), so a `@pdxui/*` specifier is checked here
// against the `exports` of the package it names.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DIAGNOSTICS } from '@pdxui/compiler';
import { typecheckPdx } from '../src/typecheck';
import { docsExamples, skillExamples, languageExamples } from '../../compiler/tests/support/published-examples';

const PACKAGES = join(__dirname, '..', '..');
const SITE = join(PACKAGES, 'site');

/** Whether `@pdxui/<pkg>[/<sub>]` is a path the workspace package exports. */
function isExported(specifier: string): boolean {
    const [, pkg, sub] = /^@pdxui\/([^/]+)(?:\/(.+))?$/.exec(specifier) ?? [];
    const manifest = join(PACKAGES, pkg ?? '', 'package.json');
    if (!pkg || !existsSync(manifest)) return false;
    const exportsMap = JSON.parse(readFileSync(manifest, 'utf-8')).exports ?? {};
    return Object.prototype.hasOwnProperty.call(exportsMap, sub ? `./${sub}` : '.');
}

/**
 * The diagnostics catalogue's examples, which the site's diagnostics page publishes. Both halves:
 * a «bad» example shows one defect, the one its code names — not a type error besides it.
 */
const CATALOGUE = Object.entries(DIAGNOSTICS).flatMap(([code, entry]) => entry.example
    ? (['bad', 'good'] as const).map(half => ({
        where: `diagnostics catalogue ${code} (${half})`,
        source: entry.example![half],
        filename: `catalogue-${code}-${half}.pdx`,
    }))
    : []);

/**
 * Type errors an example is allowed, by TypeScript code, each with its reason. Each must still
 * occur: an entry that stops matching fails, so the list cannot outlive what it excuses.
 */
const TYPE_ERRORS_SHOWN: Record<string, { tsCode: number; why: string }[]> = {
    // The defect the example shows IS the misspelt name.
    'diagnostics catalogue PDX_UNDECLARED_REF (bad)': [{ tsCode: 2552, why: 'the misspelling it shows' }],
    // The defect it shows: a quoted type drops the field, in the compiler and in the editor alike,
    // so the name it would have declared is not there.
    'diagnostics catalogue PDX_ROUTE_FIELD_INVALID (bad)': [{ tsCode: 2304, why: 'the field it drops' }],
};

const EXAMPLES = [...docsExamples(), ...skillExamples().filter(e => !e.partial), ...languageExamples(), ...CATALOGUE].map(e => ({
    ...e,
    path: join(SITE, '__published-examples__', e.filename),
}));

describe('the published .pdx examples type-check', () => {
    it('are found', () => {
        expect(EXAMPLES.length).toBeGreaterThan(50);
    });

    it('excuses only examples that exist', () => {
        // A key is where an example is; when the page moves it, the entry would excuse nothing and
        // say nothing, while the example it meant fails under another name.
        const stale = Object.keys(TYPE_ERRORS_SHOWN).filter(where => !EXAMPLES.some(e => e.where === where));
        expect(stale, 'TYPE_ERRORS_SHOWN names examples that no longer exist: point them at where the example is now').toEqual([]);
    });

    it('with no TypeScript error, and every import resolved', () => {
        const byFile = typecheckPdx(SITE, EXAMPLES.map(e => ({ path: e.path, content: e.source })));
        const found = EXAMPLES.flatMap(e => {
            const errors = byFile.get(e.path) ?? [];
            const allowed = TYPE_ERRORS_SHOWN[e.where] ?? [];
            return [
                ...errors.filter(t => !allowed.some(a => a.tsCode === t.tsCode))
                    .map(t => `${e.where} (line ${t.line} of the assembled file): TS${t.tsCode} ${t.message.split('\n')[0].slice(0, 120)}`),
                ...allowed.filter(a => !errors.some(t => t.tsCode === a.tsCode))
                    .map(a => `${e.where}: no longer raises TS${a.tsCode} (${a.why}) — take it off TYPE_ERRORS_SHOWN`),
            ];
        });
        expect(found, 'these published examples do not type-check').toEqual([]);
    }, 120_000);

    it('import only what a @pdxui package exports', () => {
        // Match: `from '@pdxui/…'` or a side-effect `import '@pdxui/…'`. Groups: [1]=specifier
        const SPECIFIER = /(?:from|import)\s+['"](@pdxui\/[^'"]+)['"]/g;
        const found = EXAMPLES.flatMap(e => [...e.source.matchAll(SPECIFIER)]
            .map(m => m[1])
            .filter(s => !isExported(s))
            .map(s => `${e.where}: '${s}' is not exported by its package`));
        expect(found, 'these published examples import a module that does not exist').toEqual([]);
    });

    it('control — the export check knows a real path from a made-up one', () => {
        expect(isExported('@pdxui/core')).toBe(true);
        expect(isExported('@pdxui/router')).toBe(true);
        expect(isExported('@pdxui/ui/button')).toBe(true);
        expect(isExported('@pdxui/ui/no-such-component')).toBe(false);
        expect(isExported('@pdxui/nope')).toBe(false);
    });
});
