// What a failed Playwright run left in its output folder, copied where the next run cannot empty it
// (#845 for the site, #975 for every config).
//
// Playwright empties a config's output folder when a run starts. A failed test's trace, its error
// context and anything a fixture wrote for it (the showcase's stall probe) are in that folder, and the
// first re-run of a red that does not reproduce, the obvious next step, deleted them unread: #611,
// #587 and an earlier issue lost their evidence that way.
//
// Every Playwright config names this module as a global teardown. After each run it copies each
// project's output folder, when the run left a failure in it, to `<output folder>-kept/<stamp>/`, keeps
// the last ten, and prints where. `packages/core/tests/keep-failures.test.ts` holds both: the copy, and
// that no config is without it.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** How many kept runs stay per output folder: enough for a few re-runs, not a growing folder. */
const KEEP = 10;

/**
 * Whether a run left a failure in `results`. A failed test leaves a folder named after it; what
 * every run writes, failed or not, is dot-named: Playwright's `.last-run.json`, and the setups'
 * `.auth/`, `.ssg/`, `.h2-cert/`.
 * @param {string} results
 */
function leftFailure(results) {
    return existsSync(results) && readdirSync(results).some((name) => !name.startsWith('.'));
}

/**
 * Copy `results` to `<keptRoot>/<stamp>` when the run left a failure in it, drop the oldest beyond the
 * last ten, and return where it went; null when there was nothing to keep.
 * @param {string} results
 * @param {string} keptRoot
 * @param {string} stamp
 * @returns {string | null}
 */
export function keepFailures(results, keptRoot, stamp) {
    if (!leftFailure(results)) return null;
    const target = join(keptRoot, stamp);
    mkdirSync(keptRoot, { recursive: true });
    cpSync(results, target, { recursive: true });
    const runs = readdirSync(keptRoot).sort();
    for (const old of runs.slice(0, Math.max(0, runs.length - KEEP))) rmSync(join(keptRoot, old), { recursive: true, force: true });
    return target;
}

/**
 * The global teardown: each project's output folder, once, kept beside it as `<folder>-kept`.
 * @param {{ projects: { outputDir: string }[] }} config Playwright's FullConfig.
 */
export default function keepFailedRuns(config) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const outputDir of new Set(config.projects.map((p) => p.outputDir))) {
        const kept = keepFailures(outputDir, `${outputDir}-kept`, stamp);
        if (kept) console.log(`[playwright] a failed run's traces are kept in ${kept}`);
    }
}
