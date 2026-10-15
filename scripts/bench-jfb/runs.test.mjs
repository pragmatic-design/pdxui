// node --test scripts/bench-jfb/runs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectRuns, runsTitle } from './runs.mjs';

/** A run that measures `value` for pdx, or throws for the runs listed in `failing`. */
const fakeRun = (failing = []) => (i) => {
    if (failing.includes(i)) throw new Error(`Runtime.callFunctionOn timed out (run ${i})`);
    return { pdx: { '01_run1k': 10 * i } };
};

test('a failed run loses only itself: the runs before and after it are kept and saved (#374)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jfb-runs-'));
    try {
        const { runs, failures } = collectRuns({ total: 3, runOnce: fakeRun([2]), saveDir: dir, log: () => {} });
        assert.deepEqual(runs, [{ pdx: { '01_run1k': 10 } }, { pdx: { '01_run1k': 30 } }]);
        assert.deepEqual(failures, [{ run: 2, message: 'Runtime.callFunctionOn timed out (run 2)' }]);
        // Each completed run is on disk as it completes, so a crash later loses none of them.
        assert.deepEqual(readdirSync(dir).sort(), ['run-1.json', 'run-3.json']);
        assert.deepEqual(JSON.parse(readFileSync(join(dir, 'run-1.json'), 'utf8')),
            { run: 1, of: 3, medians: { pdx: { '01_run1k': 10 } } });
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

test('runsTitle says how many runs the table is the median of, out of how many', () => {
    assert.equal(runsTitle(1, 1), 'one run');
    assert.equal(runsTitle(3, 3), 'median of 3 runs');
    assert.equal(runsTitle(2, 3), 'median of 2 of 3 runs');
    assert.equal(runsTitle(1, 3), 'one of 3 runs');
});
