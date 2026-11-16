// Every spec registers the tags of the markup it mounts through `loadMarkup` in `measure.ts`, in an
// evaluate of its own, never inside the evaluate that inserts the markup (#1123).
//
// Seventy-nine specs had a local `mount()` that awaited `__gotcha.load(markup)` and then built the
// fixture in ONE `page.evaluate`. On an unrelated change Chromium answered that evaluate with
// "Promise was collected" (V8 collected the promise being awaited), which Playwright reports as
// "Execution context was destroyed, most likely because of a navigation": a red with no navigation
// and nothing to do with the change. Loading first, in its own evaluate, made it pass. This fails on
// the next spec that loads inside its mount again.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const INTEGRATION = join(__dirname, '..', '..', 'responsive', 'tests', 'integration');
/** The one file allowed to call the page's loader: it is where `loadMarkup` lives. */
const HELPER = 'ui-components/contracts/measure.ts';

/** A call of the page's loader, `__gotcha.load(` or `__gotcha\n  .load(`. */
const LOAD = /__gotcha\s*\.\s*load\s*\(/g;

/** Lines of `source` that call the page's loader, comments removed. */
function loaderCalls(source: string): number[] {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
    const lines: number[] = [];
    for (const m of code.matchAll(LOAD)) lines.push(code.slice(0, m.index).split('\n').length);
    return lines;
}

function tsFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : tsFiles(path);
        return name.endsWith('.ts') ? [path] : [];
    });
}

describe('the check can fail', () => {
    // Planted: a check that always returns [] would pass the real assertion perfectly.
    it('sees the call inside an evaluate, cast or not, and across a line break', () => {
        expect(loaderCalls('x;\nawait (window as unknown as { __gotcha: G }).__gotcha.load(markup);')).toEqual([2]);
        expect(loaderCalls('await window.__gotcha\n    .load(m);')).toEqual([1]);
    });
    it('does not count a comment, or another method of the harness', () => {
        expect(loaderCalls('// __gotcha.load(markup)')).toEqual([]);
        expect(loaderCalls('/* __gotcha.load(markup) */')).toEqual([]);
        expect(loaderCalls('await window.__gotcha.loadMore(markup);')).toEqual([]);
    });
});

describe('no spec loads the tags inside its own mount', () => {
    it('every load of a markup\'s tags is measure.ts\'s loadMarkup, in an evaluate of its own', () => {
        const found: string[] = [];
        for (const file of tsFiles(INTEGRATION)) {
            const rel = relative(INTEGRATION, file).replace(/\\/g, '/');
            if (rel === HELPER) continue;
            for (const line of loaderCalls(readFileSync(file, 'utf8'))) found.push(`${rel}:${line}`);
        }
        expect(found, 'register the tags with loadMarkup(page, markup) from ui-components/contracts/measure.ts').toEqual([]);
    });

    it('the helper itself still calls the loader — the control', () => {
        expect(loaderCalls(readFileSync(join(INTEGRATION, HELPER), 'utf8')).length).toBeGreaterThan(0);
    });
});
