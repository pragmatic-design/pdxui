// What a failed Playwright run left in its output folder, copied where the next run cannot empty it
// (#845 for the site, #975 for every config).
//
// Playwright empties a config's output folder when a run starts. A failed test's trace, its error
// context and anything a fixture wrote for it (the showcase's stall probe) are in that folder, and the
// first re-run of a red that does not reproduce, the obvious next step, deleted them unread: #611,
// #587 and an earlier issue lost their evidence that way.
//
// Every Playwright config names this module as a global teardown. After each run it copies each
// project's output folder, when the run left a failure's files in it, to `<output folder>-kept/<stamp>/`, keeps
// the last ten, and prints where. `packages/core/tests/keep-failures.test.ts` holds both: the copy, and
// that no config is without it.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** How many kept runs stay per output folder: enough for a few re-runs, not a growing folder. */
const KEEP = 10;

/** Whether `path` is a file, or a folder with a file somewhere in it. @param {string} path */
function holdsAFile(path) {
    if (!statSync(path).isDirectory()) return true;
    return readdirSync(path).some((name) => holdsAFile(join(path, name)));
}

/**
 * Whether a run left evidence in `results`: a file in an entry that is not dot-named.
 *
 * Not the run's status: a global teardown runs before the reporters' `onEnd`, so `.last-run.json` is
 * still the previous run's when it does. Not a folder alone: a passing test whose spec asks for an
 * output path leaves an empty folder named after it (the showcase's retention and SSG specs do).
 * What a failure leaves is files: its trace, its error context, a fixture's record. And what every
 * run writes, failed or not, is dot-named: Playwright's `.last-run.json`, the setups' `.auth/`,
 * `.ssg/`, `.h2-cert/`. A failure that leaves no file has nothing for a rerun to lose.
 * @param {string} results
 */
function leftEvidence(results) {
    return existsSync(results) && readdirSync(results).some((name) => !name.startsWith('.') && holdsAFile(join(results, name)));
}

/**
 * Copy `results` to `<keptRoot>/<stamp>` when the run left evidence in it, drop the oldest beyond the
 * last ten, and return where it went; null when there was nothing to keep.
 * @param {string} results
 * @param {string} keptRoot
 * @param {string} stamp
 * @returns {string | null}
 */
export function keepFailures(results, keptRoot, stamp) {
    if (!leftEvidence(results)) return null;
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
