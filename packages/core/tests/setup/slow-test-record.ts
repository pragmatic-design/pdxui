// A failed test that ran over 2 s writes what its process was doing meanwhile (#991), in every vitest
// suite of the gate: `tests/slow-test-record.test.ts` holds the list.
//
// Two scans that take milliseconds alone timed out together in a pre-push, at about 5.6 s each, and the
// log said only "Test timed out". The next one says whether the process worked, collected, waited, or
// was held off the CPU — see `slow-test-sample.ts` for how each is read. Only a failure is recorded: a
// slow test that passes is not what this is for, and the log stays as it was for a green run.

import { beforeEach } from 'vitest';
import { takeSample, describeSample, failureLines } from './slow-test-sample';

beforeEach((ctx) => {
    const start = takeSample();
    ctx.onTestFailed(() => {
        const report = describeSample(start, takeSample());
        // A slow failure: the record, then `[known-failure] #991 …` when it is a timeout (#1013). A fast
        // one: only `[known-failure] #n …`, when it is a known one (#1027).
        const error = (ctx.task.result?.errors ?? []).map((e) => e.message ?? '').join('\n');
        for (const line of failureLines(ctx.task.name, ctx.task.file?.name ?? '', report, error)) console.warn(line);
    });
});
