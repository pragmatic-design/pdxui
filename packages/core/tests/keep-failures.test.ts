// A failed Playwright run keeps its traces past the next run, in every suite (#975).
//
// A config retains a failed test's trace in its output folder, `test-results/`, and the next run of
// the same config empties that folder before it starts. A flaky failure is re-run to see whether it
// is flaky, and that first re-run deleted the one trace that could say why: #611, #587 and an earlier
// issue lost theirs that way.
//
// Every config's global teardown, `scripts/lib/keep-failed-runs.mjs`, copies what a run left in its
// output folder to `<output folder>-kept/<stamp>/`, which no run empties. A clean run leaves nothing,
// so nothing is copied. It was the site's alone (#845); it now covers every config, so a gate's red
// in any browser suite brings its trace whatever is run after it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { keepFailures } from '../../../scripts/lib/keep-failed-runs.mjs';

const REPO = join(__dirname, '..', '..', '..');
const TEARDOWN = join(REPO, 'scripts', 'lib', 'keep-failed-runs.mjs');

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-keep-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('keepFailures', () => {
    it('copies what a failed run left into a stamped folder the next run does not empty', () => {
        const results = join(root, 'test-results');
        mkdirSync(join(results, 'inline-edit-focus-Tab-out'), { recursive: true });
        writeFileSync(join(results, 'inline-edit-focus-Tab-out', 'trace.zip'), 'trace');
        const kept = keepFailures(results, join(root, 'test-results-kept'), '2026-10-04T15-00-00');
        expect(kept).toBe(join(root, 'test-results-kept', '2026-10-04T15-00-00'));
        expect(readFileSync(join(kept!, 'inline-edit-focus-Tab-out', 'trace.zip'), 'utf8')).toBe('trace');
    });

    it('the control: a clean run leaves an empty folder, and nothing is kept', () => {
        const results = join(root, 'test-results');
        mkdirSync(results);
        expect(keepFailures(results, join(root, 'test-results-kept'), 'x')).toBeNull();
        expect(existsSync(join(root, 'test-results-kept'))).toBe(false);
    });

    it('a run that leaves only Playwright\'s own bookkeeping keeps nothing', () => {
        // `.last-run.json` is written by every run, passing or not: it is not a failure.
        const results = join(root, 'test-results');
        mkdirSync(results);
        writeFileSync(join(results, '.last-run.json'), '{"status":"passed","failedTests":[]}');
        expect(keepFailures(results, join(root, 'test-results-kept'), 'x')).toBeNull();
    });

    it('keeps the last ten runs, not every run since the machine was set up', () => {
        const results = join(root, 'test-results');
        const keptRoot = join(root, 'test-results-kept');
        mkdirSync(join(results, 'a'), { recursive: true });
        writeFileSync(join(results, 'a', 'trace.zip'), 't');
        for (let i = 0; i < 12; i++) keepFailures(results, keptRoot, `run-${String(i).padStart(2, '0')}`);
        expect(readdirSync(keptRoot).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `run-${String(i + 2).padStart(2, '0')}`));
    });
});

/** Every Playwright config of the repository's packages. */
function configs(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) configs(full, out);
        else if (/^playwright.*\.config\.ts$/.test(name)) out.push(full);
    }
    return out;
}

/**
 * The configs that are not a suite: a probe whose failures are the point, run by a test that reads
 * them itself, with its output folder given per run.
 */
const NOT_A_SUITE = new Set(['packages/site/tests/fixture-probe/playwright.config.ts']);

describe('every Playwright config keeps its failed runs', () => {
    const found = configs(join(REPO, 'packages')).map((f) => ({ file: f, rel: relative(REPO, f).replace(/\\/g, '/') }));

    it('found the configs, so the assertion below is not vacuous', () => {
        expect(found.length).toBeGreaterThan(10);
    });

    it('each names scripts/lib/keep-failed-runs.mjs as a global teardown', () => {
        const missing = found.filter(({ file, rel }) => {
            if (NOT_A_SUITE.has(rel)) return false;
            const src = readFileSync(file, 'utf8');
            // The path as the config writes it, resolved against the config's own folder.
            const named = [...src.matchAll(/['"]([^'"]*keep-failed-runs\.mjs)['"]/g)].map((m) => resolve(dirname(file), m[1]));
            return !/globalTeardown/.test(src) || !named.includes(TEARDOWN);
        }).map(({ rel }) => rel);
        expect(missing, 'these configs lose a failed run\'s traces to the next run').toEqual([]);
    });
});
