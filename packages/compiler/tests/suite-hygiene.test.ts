// A gate that goes red without a defect stops being read.
//
// A wall-clock RATIO between two benchmarks taken in the same process —
// `expect(prod.avg).toBeLessThan(dev.avg * 3)` — or an absolute throughput is not a sound assertion
// in the default run. `pnpm test` runs six packages in parallel, so those measurements are taken
// while the machine's load changes underneath them, and a ratio only survives that when both halves
// are slowed by the same amount. Nothing guarantees it. A 3× margin makes the failure rare, not
// sound: it can fail on a clean tree and pass on its own.
//
// A green run cannot prove the mechanism is gone — the failure is one run in many. So the property
// is asserted on the SHAPE of the suite instead: nothing in the default run reads a stopwatch. The
// benchmarks still exist and still guard against production mode acquiring a pathologically
// expensive pass; they live in `tests/perf/` and run alone, via `pnpm test:perf`, where a
// measurement means something.
//
// The rule this defends is the repo's own, and core's `suite-hygiene.test.ts` defends the other
// half of it: a suite with permanent reds stops being read, and one with INTERMITTENT reds is
// worse, because it teaches the reader to re-run instead of look.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TESTS_DIR = __dirname;
const PERF_DIR = 'perf';

/** Every `*.test.ts` under `tests/`, as a path relative to it (`perf/foo.test.ts` included). */
function testFiles(dir = TESTS_DIR, prefix = ''): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (entry.name === '__snapshots__') continue;
            out.push(...testFiles(join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.test.ts')) {
            out.push(rel);
        }
    }
    return out;
}

/**
 * Lines that read a stopwatch: `performance.now()` in any form, or two `Date.now()` reads
 * subtracted from one another.
 *
 * `Date.now()` on its own is not a stopwatch and is not flagged — `sfc-external.test.ts` uses it to
 * make a temp filename unique, which no amount of machine load can break. What breaks under load is
 * an ELAPSED time, and an elapsed time is a subtraction.
 */
function stopwatchLines(text: string): { line: number; source: string }[] {
    const hits: { line: number; source: string }[] = [];
    text.split('\n').forEach((line, i) => {
        // A comment naming a stopwatch is prose, not a stopwatch — this very file would otherwise
        // be its own first offender. A trailing comment on a line of code is not exempted.
        if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return;
        const elapsedDate = /Date\.now\(\)\s*-|-\s*(?:start|s|t0|began)\b.*Date\.now\(\)/.test(line);
        if (/performance\.now\(\)/.test(line) || elapsedDate) {
            hits.push({ line: i + 1, source: line.trim() });
        }
    });
    return hits;
}

describe('nothing in the default test run measures wall-clock time', () => {
    const files = testFiles();
    const inDefaultRun = files.filter(f => !f.startsWith(`${PERF_DIR}/`));

    it('scanned the suite, not an empty directory', () => {
        // Without this the assertion below would pass on a scan that found nothing — an exclusion is
        // invisible in its own result.
        expect(inDefaultRun.length).toBeGreaterThan(50);
    });

    it('no test in the default run reads a stopwatch', () => {
        const offenders = inDefaultRun.flatMap(f =>
            stopwatchLines(readFileSync(join(TESTS_DIR, f), 'utf-8'))
                .map(h => `${f}:${h.line}  ${h.source}`));

        expect(offenders,
            'a timing measurement taken while six packages compile in parallel is not a measurement '
            + `— move the benchmark to tests/${PERF_DIR}/ and run it with pnpm test:perf`,
        ).toEqual([]);
    });

    it('the benchmarks were moved, not deleted', () => {
        // The counter-check. Removing the timing assertions would satisfy the test above and throw
        // away the guard against production mode acquiring a pathologically expensive pass.
        const perf = files.filter(f => f.startsWith(`${PERF_DIR}/`));
        expect(perf.length, 'tests/perf/ is empty — the benchmarks were deleted').toBeGreaterThan(0);

        const measured = perf.filter(f => stopwatchLines(readFileSync(join(TESTS_DIR, f), 'utf-8')).length > 0);
        expect(measured, 'no benchmark in tests/perf/ actually measures anything').not.toEqual([]);
    });

    it('tests/perf is genuinely outside the default run', () => {
        // The exemption above is only honest if the config grants it. Without this the scan would be
        // exempting a directory that `vitest run` still executes.
        const config = readFileSync(join(TESTS_DIR, '..', 'vite.config.ts'), 'utf-8');
        expect(config, 'vite.config.ts does not exclude tests/perf from the default run')
            .toMatch(/exclude:[^\]]*tests\/perf/);
    });
});
