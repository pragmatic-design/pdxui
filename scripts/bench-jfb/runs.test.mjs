// node --test scripts/bench-jfb/runs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectRuns, runsTitle, jfbInvocations, SUB_MS_BENCHMARKS, SUB_MS_COUNT } from './runs.mjs';

/** A run that measures `value` for pdx, its medians and means, or throws for the runs listed in `failing`. */
const fakeRun = (failing = []) => (i) => {
    if (failing.includes(i)) throw new Error(`Runtime.callFunctionOn timed out (run ${i})`);
    return { medians: { pdx: { '01_run1k': 10 * i } }, means: { pdx: { '01_run1k': 10 * i + 1 } } };
};

test('a failed run loses only itself: the runs before and after it are kept and saved (#374)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jfb-runs-'));
    try {
        const { runs, failures } = collectRuns({ total: 3, runOnce: fakeRun([2]), saveDir: dir, log: () => {} });
        assert.deepEqual(runs.map((r) => r.medians), [{ pdx: { '01_run1k': 10 } }, { pdx: { '01_run1k': 30 } }]);
        assert.deepEqual(failures, [{ run: 2, message: 'Runtime.callFunctionOn timed out (run 2)' }]);
        // Each completed run is on disk as it completes, so a crash later loses none of them — its
        // medians and, since #736, its means.
        assert.deepEqual(readdirSync(dir).sort(), ['run-1.json', 'run-3.json']);
        assert.deepEqual(JSON.parse(readFileSync(join(dir, 'run-1.json'), 'utf8')),
            { run: 1, of: 3, medians: { pdx: { '01_run1k': 10 } }, means: { pdx: { '01_run1k': 11 } } });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('control — every run completing keeps them all, with no failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jfb-runs-'));
    try {
        const { runs, failures } = collectRuns({ total: 2, runOnce: fakeRun(), saveDir: dir, log: () => {} });
        assert.equal(runs.length, 2);
        assert.deepEqual(failures, []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

// #736: the four benchmarks whose vanillajs script is under a millisecond take 100 samples; the
// others keep the benchmark's own count. jfb's --count applies to every benchmark of an invocation,
// so a run is two invocations.
test('a full run is two invocations: the four sub-millisecond benchmarks with --count, the rest without', () => {
    assert.deepEqual(SUB_MS_BENCHMARKS, ['03_update10th1k_x16', '04_select1k', '05_swap1k', '06_remove-one-1k']);
    assert.equal(SUB_MS_COUNT, 100);
    const [rest, subMs] = jfbInvocations([]);
    assert.deepEqual(subMs, { benchmarks: SUB_MS_BENCHMARKS, count: 100 });
    assert.equal(rest.count, undefined);
    // Every benchmark of the pinned commit is in exactly one of the two.
    for (const id of ['01_run1k', '02_replace1k', '07_create10k', '08_create1k-after1k_x2', '09_clear1k_x8',
        '21_ready-memory', '22_run-memory', '23_update5-memory', '24_run5-memory', '25_run-clear-memory',
        '26_run-10k-memory', '30_startup', '40_sizes']) {
        assert.ok(rest.benchmarks.includes(id), id);
    }
    for (const id of SUB_MS_BENCHMARKS) assert.ok(!rest.benchmarks.includes(id), id);
});

test('--only keeps the split: what it names among the four gets the count, the rest does not', () => {
    assert.deepEqual(jfbInvocations(['04_']), [{ benchmarks: ['04_'], count: 100 }]);
    assert.deepEqual(jfbInvocations(['01_', '07_']), [{ benchmarks: ['01_', '07_'] }]);
    assert.deepEqual(jfbInvocations(['01_', '05_swap1k']), [{ benchmarks: ['01_'] }, { benchmarks: ['05_swap1k'], count: 100 }]);
});

test('runsTitle says how many runs the table is the median of, out of how many', () => {
    assert.equal(runsTitle(1, 1), 'one run');
    assert.equal(runsTitle(3, 3), 'median of 3 runs');
    assert.equal(runsTitle(2, 3), 'median of 2 of 3 runs');
    assert.equal(runsTitle(1, 3), 'one of 3 runs');
});
