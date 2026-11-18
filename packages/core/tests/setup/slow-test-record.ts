// A failed test that ran over 2 s writes what its process was doing meanwhile (#991), in every vitest
// suite of the gate: `tests/slow-test-record.test.ts` holds the list.
//
// Two scans that take milliseconds alone timed out together in a pre-push, at about 5.6 s each, and the
// log said only "Test timed out". The next one says whether the process worked, collected, waited, or
// was held off the CPU — see `slow-test-sample.ts` for how each is read. Only a failure is recorded: a
// slow test that passes is not what this is for, and the log stays as it was for a green run.
//
// A hook's failure too (#1183). A beforeEach or afterEach that fails fails its test, and reaches the
// test's onTestFailed; a beforeAll or afterAll fails its suite, and reaches nothing of a test's — a
// 10 s beforeAll left no record. The error stays on the suite, so it is read there: as the next test
// starts, and when the file ends. Its window runs from the last instant the probe saw, the end of the
// test before it or the start of the file.
//
// And the children a test waits on (#1183): a test that names them (`waitOnChild` in
// `slow-test-children.ts`) gets their CPU in its record, read over the same window.

import { afterAll, afterEach, beforeAll, beforeEach, type RunnerTask, type RunnerTestFile, type RunnerTestSuite } from 'vitest';
import { takeSample, describeSample, failureLines, hookOf, type Sample } from './slow-test-sample';
import { describeChildren, rebaseChildren } from './slow-test-children';

/** The last instant the probe saw: where a hook failure's window starts. */
let lastSeen: Sample = takeSample();
/** The suite errors already recorded, so the next test and the file's end do not print them twice. */
const recorded = new WeakSet<object>();

/** Print a record for every error a suite of `file` carries that has none yet. */
function recordSuiteFailures(file: RunnerTestFile): void {
    const suites: RunnerTestSuite[] = [];
    const walk = (s: RunnerTask): void => {
        if (s.type !== 'suite') return;
        suites.push(s);
        for (const t of s.tasks) walk(t);
    };
    walk(file);
    const failed = suites.flatMap((s) => (s.result?.errors ?? []).filter((e) => !recorded.has(e)));
    if (failed.length === 0) return;
    const end = takeSample();
    const report = describeSample(lastSeen, end, describeChildren());
    for (const error of failed) {
        recorded.add(error);
        for (const line of failureLines(hookOf(error.stack ?? ''), file.name, report, error.message ?? '')) console.warn(line);
    }
}

beforeAll(() => {
    lastSeen = takeSample();
});

beforeEach((ctx) => {
    // A beforeAll of the suite this test is in, or of one before it, may have failed since.
    recordSuiteFailures(ctx.task.file);
    rebaseChildren();
    const start = takeSample();
    ctx.onTestFailed(() => {
        // The process first: reading the children spawns a process on Windows, which would load it.
        const end = takeSample();
        const report = describeSample(start, end, describeChildren());
        // A slow failure: the record, then `[known-failure] #991 …` when it is a timeout (#1013). A fast
        // one: only `[known-failure] #n …`, when it is a known one (#1027).
        const error = (ctx.task.result?.errors ?? []).map((e) => e.message ?? '').join('\n');
        for (const line of failureLines(ctx.task.name, ctx.task.file?.name ?? '', report, error)) console.warn(line);
    });
});

afterEach(() => {
    lastSeen = takeSample();
});

// Declared here, before any of the test file's hooks: vitest runs afterAll in reverse, so this is the
// last of the file's, after an afterAll of the file's own has had its chance to fail.
afterAll(({}, suite) => {
    // The file's own afterAll is given the file.
    if (suite.type === 'suite' && suite.file === suite) recordSuiteFailures(suite.file);
});
