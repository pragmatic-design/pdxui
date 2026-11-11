// The known intermittent failures of the gate, and how to tell one when it comes back (#1013).
//
// Each entry is an issue closed as not reproduced: its red came once or a few times under the full
// `pnpm test`, never alone, and what it needs is the evidence of the next occurrence. The tools that
// keep that evidence are in place (kept traces, the stall probe, the retainer path, `[slow-test]`,
// `sockets.jsonl`); this is what ties the next red to its issue, instead of someone recognising it.
//
// `recognize(failure)` returns the entries a failure matches. The keeper reporter
// (keep-failed-runs.mjs, every Playwright config) and the slow-test record (every vitest suite of the
// gate) print `knownFailureLines` for each failed test: `[known-failure] #n …`. That line means: reopen
// #n, and comment the kept folder it names before any rerun.
//
// An entry is added when an intermittent red is closed as not reproduced, written from the occurrence
// its issue recorded, and `packages/core/tests/known-failures.test.ts` holds it to that text verbatim.
// It is removed when its issue is fixed.

/**
 * @typedef {{ at: number, gap: number }} Gap
 * @typedef {{ gapMs?: number, page: { heartbeat: Gap[], longTasks: { duration: number }[] } | { unreadable: string }, runner: { heartbeat: Gap[] } }} StallProbe
 * @typedef {{ file: string, title: string, error: string, probe?: StallProbe | null, slowTest?: object | null }} Failure
 * @typedef {{ issue: number, says: string, evidence: string, matches: (f: Failure) => boolean }} Known
 */

/** A stall that long is the cause of a 5 s wait, not noise beside it. */
const STALL_MS = 1000;

/** Test errors that say a test waited and gave up: Playwright's and vitest's wordings. */
const TIMED_OUT = /Timeout: \d+ms|Timeout \d+ms exceeded|Test timeout of \d+ms exceeded|timed out in \d+ms/i;

/** A module or stylesheet the server did not serve. */
const REFUSED = /ERR_CONNECTION_REFUSED|Failed to fetch dynamically imported module|Unable to preload CSS/;

const fileIs = (f, name) => f.file.replace(/\\/g, '/').endsWith(`/${name}`);
const longest = (list) => Math.max(0, ...list.map((x) => x.duration ?? x.gap ?? 0));

/** The page's record, when the probe could read it. */
const pageOf = (f) => (f.probe && !('unreadable' in f.probe.page) ? f.probe.page : null);

/** The page ran its own script for a whole stall: a long task of its own. */
const frozenPage = (f) => {
    const page = pageOf(f);
    return page !== null && longest(page.longTasks) >= STALL_MS;
};

/** The page and the runner both ran, and nothing stalled: the page was waiting on something. */
const idlePage = (f) => {
    const page = pageOf(f);
    return page !== null && longest(page.longTasks) < STALL_MS && longest(page.heartbeat) < STALL_MS
        && longest(f.probe.runner.heartbeat) < STALL_MS;
};

/** @type {Known[]} */
export const KNOWN = [
    {
        issue: 617,
        says: 'a route chunk or stylesheet refused by the preview server under load',
        evidence: 'sockets.jsonl and the trace (ERR_CONNECTION_REFUSED, status -1) in the kept folder',
        // The error says so; or the test timed out with the page idle, the refusal being in the trace only.
        matches: (f) => REFUSED.test(f.error) || (TIMED_OUT.test(f.error) && idlePage(f)),
    },
    {
        issue: 611,
        says: 'a showcase page frozen by a long task of its own script',
        evidence: 'stall-probe.json in the trace: page.longFrames names the script; dist/assets/*.js.map maps it',
        matches: (f) => frozenPage(f),
    },
    {
        issue: 587,
        says: 'permissions-edit row 60: the checkbox never stable for the click, on the dev server',
        evidence: 'the trace in packages/showcase/test-results-kept/',
        matches: (f) => fileIs(f, 'permissions-edit.spec.ts') && f.title.includes('a grant taken from a role'),
    },
    {
        issue: 540,
        says: 'topbar at 390: no bar-title after goto(\'/\')',
        evidence: 'the trace and its stall-probe.json in packages/showcase/test-results-kept/',
        matches: (f) => fileIs(f, 'topbar.spec.ts') && f.error.includes('bar-title'),
    },
    {
        issue: 937,
        says: 'a retention row with instances alive after a GC',
        evidence: 'the attachment «retainer path of a live <tag>» of the failed row',
        matches: (f) => /removed instances are still alive after a GC/.test(f.error),
    },
    {
        issue: 991,
        says: 'a fast vitest test timed out under the gate\'s load',
        evidence: 'the [slow-test] line just above: its reading names what held the process',
        // A timeout, not any slow failure: a slow test that asserts wrong is a test failing.
        matches: (f) => Boolean(f.slowTest) && TIMED_OUT.test(f.error),
    },
];

/**
 * The known failures `failure` matches.
 * @param {Failure} failure
 * @returns {Known[]}
 */
export function recognize(failure) {
    return KNOWN.filter((k) => k.matches(failure));
}

/**
 * One line per known failure `failure` matches: the issue, what it is, the test, and where to look.
 * @param {Failure} failure
 * @param {string} where the kept folder, or the log the record is in
 * @returns {string[]}
 */
export function knownFailureLines(failure, where) {
    const name = failure.file.replace(/\\/g, '/').split('/').pop();
    return recognize(failure).map((k) =>
        `[known-failure] #${k.issue} (${k.says}): ${name} › ${failure.title} — reopen #${k.issue} with ${k.evidence}, from ${where}, before any rerun`);
}
