/**
 * Wait for a condition instead of for a duration.
 *
 * A fixed `setTimeout` in an async test is a bet that the machine is fast enough today. It is the
 * "sleep instead of real synchronisation" the repository forbids, and it fails in the worst way:
 * intermittently, under load, in a suite whose green count is what every story is closed against.
 *
 * Throws with the label rather than letting the assertion report a half-finished value, so work that
 * never completes is distinguishable from work that completed into the wrong answer.
 *
 * Counts ATTEMPTS, not milliseconds, and that is deliberate rather than stylistic: reading a
 * stopwatch in the default run is what `suite-hygiene.test.ts` forbids, and its exemption list is a
 * ratchet standing at four. A count also behaves better than a deadline — on a loaded machine each
 * `setTimeout(5)` slips, so the budget stretches with the machine instead of expiring against it.
 *
 * 200 rather than a larger number so this throws BEFORE vitest's own 5s test timeout: at 600 the
 * never-completes case dies as `Test timed out in 5000ms`, which says nothing about what was being
 * waited for. A diagnostic that loses the race to a generic timeout is not a diagnostic. Measured
 * against 60ms of real work, this leaves roughly thirty times the margin needed.
 *
 * It lives here, and not inside one test file, because more than one test file waits on the same
 * intermittent shape (`dx-improvements.test.ts` among them).
 */
export async function waitUntil(predicate: () => boolean, label: string, tries = 200): Promise<void> {
    for (let i = 0; i < tries; i++) {
        if (predicate()) return;
        await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`gave up after ${tries} checks waiting for ${label}`);
}
