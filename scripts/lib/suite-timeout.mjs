// The global timeout of a Playwright suite of the gate (#1040): a run that stops moving fails,
// instead of holding the pre-push until someone ends it by hand.
//
// #1025 bounded design's suite after the pre-push sat 38 minutes after its last test; on 2026-11-12
// the showcase's dev suite did the same for 31 minutes, and no other config had a bound. Every config
// the gate runs sets `globalTimeout: suiteTimeout(<seconds>)`, and
// `packages/core/tests/suite-timeout.test.ts` fails when one does not.
//
// The argument is the slowest run of that suite measured, locally under the gate's load or on CI
// (one worker, one shard), written beside it with where it was measured. The margin is the rule
// here, the same for every suite: three times that run, rounded up to the minute, and never under
// five minutes — a slow machine is not a hang, and a bound that a busy run reaches is a false red.
//
// An expiry reaches the reporter `keep-failed-runs.mjs` as an error outside any test: it prints
// `[known-failure] #1025` with the tests still running and keeps their traces.

/** The floor: no suite is bounded under this, however fast it runs. */
const FLOOR_MS = 5 * 60_000;

/** How many times its slowest measured run a suite may take before it is called stopped. */
const MARGIN = 3;

/**
 * The global timeout, in milliseconds, of a suite whose slowest measured run took `slowestSeconds`.
 * @param {number} slowestSeconds
 * @returns {number}
 */
export function suiteTimeout(slowestSeconds) {
    return Math.max(FLOOR_MS, Math.ceil((slowestSeconds * MARGIN) / 60) * 60_000);
}
