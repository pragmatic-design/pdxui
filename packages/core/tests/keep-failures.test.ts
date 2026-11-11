// A failed Playwright run keeps its traces past the next run, in every suite (#975).
//
// A config retains a failed test's trace in its output folder, `test-results/`, and the next run of
// the same config empties that folder before it starts. A flaky failure is re-run to see whether it
// is flaky, and that first re-run deleted the one trace that could say why: #611, #587 and an earlier
// issue lost theirs that way.
//
// Every config's reporter `scripts/lib/keep-failed-runs.mjs` copies what a failed run left in its
// output folder to `<output folder>-kept/<stamp>/`, which no run empties. It reads the run's status
// in `onEnd`: a passed run is not kept, whatever its tests wrote (#990 — the touch-target specs write a
// measurement on success, and a green run said it had failed). It was the site's alone (#845); it now
// covers every config, so a gate's red in any browser suite brings its trace whatever is run after it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import KeepFailedRuns, { keepFailures } from '../../../scripts/lib/keep-failed-runs.mjs';

const REPO = join(__dirname, '..', '..', '..');
const KEEPER = join(REPO, 'scripts', 'lib', 'keep-failed-runs.mjs');

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-keep-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('keepFailures', () => {
    it('copies what a failed run left into a stamped folder the next run does not empty', () => {
        const results = join(root, 'test-results');
        mkdirSync(join(results, 'inline-edit-focus-Tab-out'), { recursive: true });
        writeFileSync(join(results, 'inline-edit-focus-Tab-out', 'trace.zip'), 'trace');
        const kept = keepFailures(results, join(root, 'test-results-kept'), '2026-10-04T15-00-00', 'failed');
        expect(kept).toBe(join(root, 'test-results-kept', '2026-10-04T15-00-00'));
        expect(readFileSync(join(kept!, 'inline-edit-focus-Tab-out', 'trace.zip'), 'utf8')).toBe('trace');
    });

    it('a passed run is not kept, whatever its tests wrote (#990)', () => {
        // touch-targets.spec.ts writes measured.json on success: a green certification run said it had
        // failed and took a kept slot.
        const results = join(root, 'test-results');
        mkdirSync(join(results, 'touch-targets-select-corporate'), { recursive: true });
        writeFileSync(join(results, 'touch-targets-select-corporate', 'measured.json'), '[]');
        expect(keepFailures(results, join(root, 'test-results-kept'), 'x', 'passed')).toBeNull();
        expect(existsSync(join(root, 'test-results-kept'))).toBe(false);
    });

    it('a run that timed out or was interrupted is kept: it did not pass', () => {
        const results = join(root, 'test-results');
        mkdirSync(join(results, 'a'), { recursive: true });
        writeFileSync(join(results, 'a', 'trace.zip'), 't');
        expect(keepFailures(results, join(root, 'kept-t'), 'x', 'timedout')).not.toBeNull();
        expect(keepFailures(results, join(root, 'kept-i'), 'x', 'interrupted')).not.toBeNull();
    });

    it('a failed run that left no output folder keeps nothing, and does not throw', () => {
        expect(keepFailures(join(root, 'never-made'), join(root, 'test-results-kept'), 'x', 'failed')).toBeNull();
    });

    it('keeps the last ten runs, not every run since the machine was set up', () => {
        const results = join(root, 'test-results');
        const keptRoot = join(root, 'test-results-kept');
        mkdirSync(join(results, 'a'), { recursive: true });
        writeFileSync(join(results, 'a', 'trace.zip'), 't');
        for (let i = 0; i < 12; i++) keepFailures(results, keptRoot, `run-${String(i).padStart(2, '0')}`, 'failed');
        expect(readdirSync(keptRoot).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `run-${String(i + 2).padStart(2, '0')}`));
    });
});

describe('the reporter', () => {
    it('copies each project\'s output folder once, on a failed run, and nothing on a passed one', async () => {
        const out = join(root, 'test-results');
        mkdirSync(join(out, 'a'), { recursive: true });
        writeFileSync(join(out, 'a', 'measured.json'), '[]');
        const config = { projects: [{ outputDir: out }, { outputDir: out }] };
        const passed = new KeepFailedRuns();
        passed.onBegin(config);
        passed.onEnd({ status: 'passed' });
        expect(existsSync(`${out}-kept`), 'a passed run was kept').toBe(false);
        const failed = new KeepFailedRuns();
        failed.onBegin(config);
        failed.onEnd({ status: 'failed' });
        expect(readdirSync(`${out}-kept`), 'two projects sharing a folder copied it twice').toHaveLength(1);
    });

    it('does not take the terminal from the config\'s own reporters', () => {
        // A reporter that prints nothing says so, or Playwright adds a line reporter beside the config's.
        expect(new KeepFailedRuns().printsToStdio()).toBe(false);
    });
});

describe('the reporter names a known intermittent failure (#1013)', () => {
    const failed = (file: string, title: string, message: string, probe?: object) => ({
        test: { location: { file }, title, expectedStatus: 'passed' },
        result: {
            status: 'timedOut',
            errors: [{ message }],
            attachments: probe ? [{ name: 'stall-probe.json', contentType: 'application/json', body: Buffer.from(JSON.stringify(probe)) }] : [],
        },
    });

    function run(...tests: ReturnType<typeof failed>[]): { lines: string[]; kept: string } {
        const out = join(root, 'test-results');
        mkdirSync(join(out, 'a'), { recursive: true });
        const lines: string[] = [];
        const log = vi.spyOn(console, 'log').mockImplementation((line: string) => { lines.push(line); });
        try {
            const reporter = new KeepFailedRuns();
            reporter.onBegin({ projects: [{ outputDir: out }] });
            for (const t of tests) reporter.onTestEnd(t.test, t.result);
            reporter.onEnd({ status: 'failed' });
        } finally {
            log.mockRestore();
        }
        return { lines, kept: join(`${out}-kept`, readdirSync(`${out}-kept`)[0]) };
    }

    it('prints the issue to reopen and writes known-failures.json into the kept folder', () => {
        const { lines, kept } = run(failed(join(root, 'tests', 'component-pages.spec.ts'), 'relation-picker',
            'TypeError: Failed to fetch dynamically imported module: http://localhost:5251/assets/index-CYnFLpTt.js'));
        const known = lines.filter((l) => l.startsWith('[known-failure]'));
        expect(known).toHaveLength(1);
        expect(known[0]).toMatch(/^\[known-failure\] #617 .*component-pages\.spec\.ts › relation-picker/);
        expect(known[0]).toContain(kept);
        const record = JSON.parse(readFileSync(join(kept, 'known-failures.json'), 'utf8'));
        expect(record).toEqual([{ issue: 617, test: 'component-pages.spec.ts › relation-picker' }]);
    });

    it('reads the stall probe a test attached: a frozen page is #611', () => {
        const probe = { gapMs: 300, page: { heartbeat: [{ at: 1, gap: 9790 }], longTasks: [{ at: 1, duration: 9683, name: 'self' }], longFrames: [] }, runner: { heartbeat: [] } };
        const { lines } = run(failed(join(root, 'tests', 'assets.spec.ts'), 'details', 'Error: expect(locator).toBeVisible() failed\nTimeout: 5000ms', probe));
        expect(lines.filter((l) => l.startsWith('[known-failure]')).map((l) => l.slice(0, 20))).toEqual(['[known-failure] #611']);
    });

    it('an unrelated failure is kept, and named as nothing known', () => {
        const { lines, kept } = run(failed(join(root, 'tests', 'customers.spec.ts'), 'sorts', 'Error: expect(received).toBe(expected)'));
        expect(lines.filter((l) => l.startsWith('[known-failure]'))).toEqual([]);
        expect(existsSync(join(kept, 'known-failures.json'))).toBe(false);
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

    it('each names scripts/lib/keep-failed-runs.mjs as a reporter, not as a global teardown', () => {
        // A global teardown runs before the reporters' onEnd, so it cannot know whether the run passed (#990).
        const missing = found.filter(({ file, rel }) => {
            if (NOT_A_SUITE.has(rel)) return false;
            const src = readFileSync(file, 'utf8');
            // The path as the config writes it, resolved against the config's own folder, inside `reporter`.
            const reporter = /reporter:\s*\[([\s\S]*?)\]\s*,\s*\n/.exec(src)?.[1] ?? '';
            const named = [...reporter.matchAll(/['"]([^'"]*keep-failed-runs\.mjs)['"]/g)].map((m) => resolve(dirname(file), m[1]));
            return !named.includes(KEEPER);
        }).map(({ rel }) => rel);
        expect(missing, 'these configs lose a failed run\'s traces to the next run').toEqual([]);
    });

    it('none names it as a global teardown any more', () => {
        const stale = found.filter(({ file }) => /globalTeardown[^\n]*keep-failed-runs/.test(readFileSync(file, 'utf8'))).map(({ rel }) => rel);
        expect(stale).toEqual([]);
    });
});
