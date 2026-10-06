// What a failed run left in `test-results/`, copied where the next run cannot empty it.
//
// Playwright empties its output folder when a run starts. The site retains a failed test's trace,
// and the first re-run of a flaky failure — the obvious next step — would delete it unread.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** How many kept runs stay: enough for a few re-runs, not a growing folder. */
const KEEP = 10;

/**
 * Copy `results` to `<keptRoot>/<stamp>` when the run left anything in it (a passing test leaves
 * nothing under `retain-on-failure`), drop the oldest beyond the last ten, and return where it went.
 */
export function keepFailures(results: string, keptRoot: string, stamp: string): string | null {
    if (!existsSync(results) || readdirSync(results).length === 0) return null;
    const target = join(keptRoot, stamp);
    mkdirSync(keptRoot, { recursive: true });
    cpSync(results, target, { recursive: true });
    const runs = readdirSync(keptRoot).sort();
    for (const old of runs.slice(0, Math.max(0, runs.length - KEEP))) rmSync(join(keptRoot, old), { recursive: true, force: true });
    return target;
}
