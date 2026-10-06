// A failed site test keeps its trace past the next run.
//
// The site's Playwright config retains a failed test's trace, in `test-results/`, and the
// next run of the same config empties that folder before it starts. A flaky failure is re-run to see
// whether it is flaky, and that first re-run would delete the one trace that could say why.
//
// The site's global teardown copies what a run left in `test-results/` to `test-results-kept/<stamp>/`,
// which no run empties. A clean run leaves nothing, so nothing is copied.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { keepFailures } from '../../site/tests/keep-failures';

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

    it('keeps the last ten runs, not every run since the machine was set up', () => {
        const results = join(root, 'test-results');
        const keptRoot = join(root, 'test-results-kept');
        mkdirSync(join(results, 'a'), { recursive: true });
        writeFileSync(join(results, 'a', 'trace.zip'), 't');
        for (let i = 0; i < 12; i++) keepFailures(results, keptRoot, `run-${String(i).padStart(2, '0')}`);
        expect(readdirSync(keptRoot).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `run-${String(i + 2).padStart(2, '0')}`));
    });
});
