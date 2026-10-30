// The runs of one comparison, kept as they complete (#374).
//
// `--runs N` repeats the whole benchmark run. A run that fails — the driver's CDP call timing out in
// one benchmark of one framework, as it did on 2026-10-13 — used to end the comparison and lose the
// runs before it, which were only in memory. Now each completed run's medians are written to disk the
// moment it completes, a failed run is recorded and reported, and the comparison goes on to the next
// run. A failed run is not repeated: whether to re-run one, and how many times, is a policy for the
// owner (#374, step 3), not something this file decides.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Runs `runOnce(i)` for i = 1…total. Each result — `{ medians, means }`, each `{ [framework]: { [metric]:
 * value } }` — is saved to `<saveDir>/run-<i>.json` as it completes; a run that throws is recorded in
 * `failures` with its message, and the next run starts.
 */
export function collectRuns({ total, runOnce, saveDir, log = console.log }) {
    const runs = [];
    const failures = [];
    mkdirSync(saveDir, { recursive: true });
    for (let i = 1; i <= total; i++) {
        try {
            const result = runOnce(i);
            runs.push(result);
            const file = join(saveDir, `run-${i}.json`);
            writeFileSync(file, JSON.stringify({ run: i, of: total, ...result }, null, 2));
            log(`[bench:jfb] run ${i} of ${total} completed; its medians and means are in ${file}`);
        } catch (error) {
            const message = error?.message ?? String(error);
            failures.push({ run: i, message });
            log(`[bench:jfb] run ${i} of ${total} FAILED: ${message}`);
        }
    }
    return { runs, failures };
}

/**
 * The benchmarks whose vanillajs script takes under a millisecond (#736). The benchmark reports times
 * in steps of 0.1 ms and its samples spread far wider than that (select1k's vanillajs: 0.2 to 1.7 ms),
 * so these take more samples than the benchmark's own count. Their ids are the pinned commit's
 * (run.mjs, JFB_COMMIT); moving it is a change to review, and so is this list.
 */
export const SUB_MS_BENCHMARKS = ['03_update10th1k_x16', '04_select1k', '05_swap1k', '06_remove-one-1k'];
/** Their sample count. The benchmark adds its own extra runs on top (select1k: 10). */
export const SUB_MS_COUNT = 100;
/** Every other benchmark of the pinned commit, which keeps the benchmark's own count. */
const OTHER_BENCHMARKS = ['01_run1k', '02_replace1k', '07_create10k', '08_create1k-after1k_x2', '09_clear1k_x8',
    '21_ready-memory', '22_run-memory', '23_update5-memory', '24_run5-memory', '25_run-clear-memory',
    '26_run-10k-memory', '30_startup', '40_sizes'];

/**
 * The benchmark invocations of one run: `--count` applies to every benchmark of an invocation, so the
 * four sub-millisecond benchmarks run apart, with SUB_MS_COUNT samples. `only` (`--only`) keeps the
 * split: an entry that names one of the four — `04_`, `04_select1k` — goes with them.
 */
export function jfbInvocations(only) {
    const isSubMs = (entry) => SUB_MS_BENCHMARKS.some((id) => id.startsWith(entry) || entry.startsWith(id));
    const [subMs, rest] = only.length
        ? [only.filter(isSubMs), only.filter((e) => !isSubMs(e))]
        : [SUB_MS_BENCHMARKS, OTHER_BENCHMARKS];
    return [
        ...(rest.length ? [{ benchmarks: rest }] : []),
        ...(subMs.length ? [{ benchmarks: subMs, count: SUB_MS_COUNT }] : []),
    ];
}

/** What the table is a median of: `median of 2 of 3 runs` when a run failed. */
export function runsTitle(completed, total) {
    if (completed === total) return total > 1 ? `median of ${total} runs` : 'one run';
    return completed > 1 ? `median of ${completed} of ${total} runs` : `one of ${total} runs`;
}
