// scripts/bench-jfb/thresholds.mjs (#248): the nightly js-framework-benchmark run fails when PDX
// crosses a threshold. Script times are held as PDX's ratio to vanillajs in the same run, which
// carries across machines where a millisecond does not; memory is held in MB.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { checkThresholds } from '../../../scripts/bench-jfb/thresholds.mjs';

const RUN = {
    vanillajs: { '07_create10k script': 25, '04_select1k script': 2, '22_run-memory': 1.0 },
    pdx: { '07_create10k script': 50, '04_select1k script': 2.2, '22_run-memory': 2.5 },
};

describe('checkThresholds', () => {
    it('passes a run under every threshold, and reports the ratio it measured', () => {
        const { failures, rows } = checkThresholds(RUN, {
            ratio: { '07_create10k script': 2.5, '04_select1k script': 1.2 },
            memoryMB: { '22_run-memory': 3 },
        });
        expect(failures).toEqual([]);
        expect(rows.find((r) => r.metric === '07_create10k script')).toMatchObject({ kind: 'ratio', value: 2, threshold: 2.5, ok: true });
        expect(rows.find((r) => r.metric === '22_run-memory')).toMatchObject({ kind: 'memoryMB', value: 2.5, ok: true });
    });

    it('fails a ratio over its threshold, naming the metric', () => {
        const { failures } = checkThresholds(RUN, { ratio: { '07_create10k script': 1.5 }, memoryMB: {} });
        expect(failures).toEqual([expect.stringContaining('07_create10k script')]);
    });

    it('fails memory over its threshold, naming the metric', () => {
        const { failures } = checkThresholds(RUN, { ratio: {}, memoryMB: { '22_run-memory': 2 } });
        expect(failures).toEqual([expect.stringContaining('22_run-memory')]);
    });

    it('fails a metric the run does not have, rather than passing it', () => {
        const { failures } = checkThresholds(RUN, { ratio: { '09_clear1k_x8 script': 2 }, memoryMB: {} });
        expect(failures).toEqual([expect.stringContaining('09_clear1k_x8 script')]);
    });

    it('fails when vanillajs is missing, since a ratio needs it', () => {
        const { failures } = checkThresholds({ pdx: RUN.pdx }, { ratio: { '04_select1k script': 2 }, memoryMB: {} });
        expect(failures).toEqual([expect.stringContaining('04_select1k script')]);
    });

    it('reports a threshold of null without holding it: how the first nightly measures', () => {
        const { failures, rows } = checkThresholds(RUN, { ratio: { '07_create10k script': null }, memoryMB: {} });
        expect(failures).toEqual([]);
        expect(rows).toEqual([expect.objectContaining({ metric: '07_create10k script', value: 2, threshold: null, ok: true })]);
    });

    it('a null threshold still fails a missing metric', () => {
        const { failures } = checkThresholds(RUN, { ratio: { '01_run1k script': null }, memoryMB: {} });
        expect(failures).toEqual([expect.stringContaining('01_run1k script')]);
    });
});

// The run's own summary — reading the results, combining runs, the table — has node:test tests of
// its own beside it, which no gate ran: found while doing #248. They run here, so `pnpm test` does.
describe('scripts/bench-jfb/summarize.test.mjs', () => {
    it('passes under node --test', () => {
        const file = join(__dirname, '..', '..', '..', 'scripts', 'bench-jfb', 'summarize.test.mjs');
        const out = execFileSync(process.execPath, ['--test', file], { encoding: 'utf8' });
        expect(out).toMatch(/^# fail 0$/m);
        expect(out).toMatch(/^# pass [1-9]/m);
    });
});
