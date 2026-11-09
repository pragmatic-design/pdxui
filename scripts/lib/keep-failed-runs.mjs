// What a failed Playwright run left in its output folder, copied where the next run cannot empty it
// (#845 for the site, #975 for every config, #990 for reading the run's status).
//
// Playwright empties a config's output folder when a run starts. A failed test's trace, its error
// context and anything a fixture wrote for it (the showcase's stall probe) are in that folder, and the
// first re-run of a red that does not reproduce, the obvious next step, deleted them unread: #611,
// #587 and an earlier issue lost their evidence that way.
//
// Every Playwright config lists this module among its reporters. When a run ends and did not pass, it
// copies each project's output folder to `<output folder>-kept/<stamp>/`, keeps the last ten, and
// prints where. A reporter, not a global teardown: the teardown runs before the reporters' `onEnd`,
// so it cannot know the run's status, and guessing it from the files kept a green run whose tests
// wrote a measurement on success (#990). `packages/core/tests/keep-failures.test.ts` holds both: the
// copy, and that no config is without it.
//
// A `--reporter` on the command line replaces the config's reporters, this one with them: a run
// started that way keeps nothing. No script of the repository passes one.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** How many kept runs stay per output folder: enough for a few re-runs, not a growing folder. */
const KEEP = 10;

/**
 * Copy `results` to `<keptRoot>/<stamp>` when the run did not pass and left the folder, drop the
 * oldest beyond the last ten, and return where it went; null when there was nothing to keep.
 * @param {string} results
 * @param {string} keptRoot
 * @param {string} stamp
 * @param {'passed' | 'failed' | 'timedout' | 'interrupted'} status the run's, from `onEnd`
 * @returns {string | null}
 */
export function keepFailures(results, keptRoot, stamp, status) {
    if (status === 'passed' || !existsSync(results)) return null;
    const target = join(keptRoot, stamp);
    mkdirSync(keptRoot, { recursive: true });
    cpSync(results, target, { recursive: true });
    const runs = readdirSync(keptRoot).sort();
    for (const old of runs.slice(0, Math.max(0, runs.length - KEEP))) rmSync(join(keptRoot, old), { recursive: true, force: true });
    return target;
}

/** The reporter: each project's output folder, once, kept beside it as `<folder>-kept`. */
export default class KeepFailedRuns {
    /** @type {string[]} */
    #outputDirs = [];

    /** @param {{ projects: { outputDir: string }[] }} config Playwright's FullConfig. */
    onBegin(config) {
        this.#outputDirs = [...new Set(config.projects.map((p) => p.outputDir))];
    }

    /** @param {{ status: 'passed' | 'failed' | 'timedout' | 'interrupted' }} result Playwright's FullResult. */
    onEnd(result) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        for (const outputDir of this.#outputDirs) {
            const kept = keepFailures(outputDir, `${outputDir}-kept`, stamp, result.status);
            if (kept) console.log(`[playwright] a failed run's traces are kept in ${kept}`);
        }
    }

    /** It prints one line on a failed run, beside the config's own reporters, and takes nothing from them. */
    printsToStdio() {
        return false;
    }
}
