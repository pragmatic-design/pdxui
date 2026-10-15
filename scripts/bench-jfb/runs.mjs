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
 * Runs `runOnce(i)` for i = 1…total. Each result is saved to `<saveDir>/run-<i>.json` as it completes;
 * a run that throws is recorded in `failures` with its message, and the next run starts.
 */
export function collectRuns({ total, runOnce, saveDir, log = console.log }) {
    const runs = [];
    const failures = [];
    mkdirSync(saveDir, { recursive: true });
    for (let i = 1; i <= total; i++) {
        try {
            const medians = runOnce(i);
            runs.push(medians);
            const file = join(saveDir, `run-${i}.json`);
            writeFileSync(file, JSON.stringify({ run: i, of: total, medians }, null, 2));
            log(`[bench:jfb] run ${i} of ${total} completed; its medians are in ${file}`);
        } catch (error) {
            const message = error?.message ?? String(error);
            failures.push({ run: i, message });
            log(`[bench:jfb] run ${i} of ${total} FAILED: ${message}`);
        }
    }
    return { runs, failures };
}

/** What the table is a median of: `median of 2 of 3 runs` when a run failed. */
export function runsTitle(completed, total) {
    if (completed === total) return total > 1 ? `median of ${total} runs` : 'one run';
    return completed > 1 ? `median of ${completed} of ${total} runs` : `one of ${total} runs`;
}
