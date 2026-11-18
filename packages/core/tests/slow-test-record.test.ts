// A failed test that ran over 2 s says what its process was doing meanwhile (#991).
//
// Two scans that are milliseconds alone timed out together in a pre-push, at about 5.6 s each, in two
// packages: something held both processes, and nothing in the log said what. The setup file
// `tests/setup/slow-test-record.ts`, in every vitest suite of the gate, writes a record for such a test:
// its wall time against the time its event loop was busy, the CPU its process used, the time spent in
// garbage collection, and the heap. Those tell a process that worked (CPU, collection) from one that
// waited (on the disk, or for the machine) — the question the next occurrence has to answer.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { takeSample, describeSample, recordLine, recordLines, failureLines, hookOf, SLOW_TEST_MS, ON_CPU } from './setup/slow-test-sample';

/** Keeps the event loop busy, on the CPU, for `ms`. */
function spin(ms: number): void {
    const end = Date.now() + ms;
    let x = 0;
    while (Date.now() < end) x += Math.sqrt(x + 1);
    if (x < 0) throw new Error('unreachable');
}

describe('the sample', () => {
    it('a test that blocks the event loop on the CPU reads as busy, with its CPU', () => {
        const start = takeSample();
        spin(600);
        const r = describeSample(start, takeSample());
        expect(r.wallMs).toBeGreaterThanOrEqual(590);
        expect(r.loopBusy, 'the event loop was busy the whole time').toBeGreaterThan(0.8);
        // What the sample reads as work, not how much CPU the machine granted: under the pre-push's
        // parallel suites a loop that never yielded got 60% of one, and `> 0.6` failed (#1133).
        expect(r.cpuShare, 'the process was on the CPU, as the reading counts it').toBeGreaterThanOrEqual(ON_CPU);
        expect(r.reading).toBe('working on the CPU');
    });

    it('the control: a test that waits on a timer reads as waiting, its loop idle', async () => {
        const start = takeSample();
        await sleep(600);
        const r = describeSample(start, takeSample());
        expect(r.loopBusy).toBeLessThan(0.3);
        expect(r.cpuShare).toBeLessThan(0.3);
        expect(r.reading).toBe('waiting, its event loop idle');
    });

    it('a loop busy with no CPU behind it reads as held off the CPU', () => {
        // Built, not measured: a process the machine does not schedule, or one in a synchronous wait on
        // the disk, keeps its loop in JavaScript while its CPU time stands still.
        const r = describeSample(
            { at: 0, elu: { idle: 0, active: 0, utilization: 0 }, cpu: { user: 0, system: 0 }, gcMs: 0 },
            { at: 5600, elu: { idle: 100, active: 5500, utilization: 0.98 }, cpu: { user: 200_000, system: 50_000 }, gcMs: 10 },
        );
        expect(r.reading).toBe('held off the CPU: not scheduled, or in a synchronous wait');
    });

    it('collection over half the wall time reads as garbage collection', () => {
        const r = describeSample(
            { at: 0, elu: { idle: 0, active: 0, utilization: 0 }, cpu: { user: 0, system: 0 }, gcMs: 0 },
            { at: 4000, elu: { idle: 0, active: 4000, utilization: 1 }, cpu: { user: 3_900_000, system: 0 }, gcMs: 2500 },
        );
        expect(r.reading).toBe('collecting garbage');
    });

    it('the record is one line the gate log can be searched for', () => {
        const line = recordLine('a scan', 'tests/public-tree.test.ts', describeSample(takeSample(), takeSample()));
        expect(line.startsWith('[slow-test] ')).toBe(true);
        expect(line).not.toContain('\n');
        const data = JSON.parse(line.slice('[slow-test] '.length));
        expect(data).toMatchObject({ test: 'a scan', file: 'tests/public-tree.test.ts' });
        for (const key of ['wallMs', 'loopBusy', 'cpuShare', 'gcMs', 'heapUsedMB', 'heapLimitMB', 'freeMemMB', 'reading']) expect(data).toHaveProperty(key);
    });

    it('the record is followed by the known failure it is (#1013): this is #991 coming back', () => {
        const lines = recordLines('a scan', 'tests/public-tree.test.ts', describeSample(takeSample(), takeSample()), 'Error: Test timed out in 5000ms.');
        expect(lines[0].startsWith('[slow-test] ')).toBe(true);
        expect(lines.slice(1)).toHaveLength(1);
        expect(lines[1]).toMatch(/^\[known-failure\] #991 .*public-tree\.test\.ts › a scan/);
    });

    it('the control: a slow test that asserts wrong is not #991, which is a timeout', () => {
        const lines = recordLines('a scan', 'tests/public-tree.test.ts', describeSample(takeSample(), takeSample()), 'AssertionError: expected 1 to be 2');
        expect(lines).toHaveLength(1);
    });

    it('a fast failure gets no record, and is still named when it is a known one (#1027)', () => {
        // remove-tree's grandchild case failed in milliseconds: a registry read only for slow failures
        // would never have named it.
        const fast = describeSample(takeSample(), takeSample());
        const lines = failureLines('on Windows, names a process outside the children that sits in the tree', 'tests/remove-tree.test.ts', fast,
            'AssertionError: the given combination of arguments (undefined and string) is invalid for this assertion');
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatch(/^\[known-failure\] #1027 /);
    });

    it('the control: a fast failure that is nothing known prints nothing', () => {
        const fast = describeSample(takeSample(), takeSample());
        expect(failureLines('sorts', 'tests/sort.test.ts', fast, 'AssertionError: expected 1 to be 2')).toEqual([]);
    });

    it('a slow failure still gets its record first', () => {
        const slow = { ...describeSample(takeSample(), takeSample()), wallMs: SLOW_TEST_MS + 1 };
        const lines = failureLines('a scan', 'tests/public-tree.test.ts', slow, 'Error: Test timed out in 5000ms.');
        expect(lines[0].startsWith('[slow-test] ')).toBe(true);
        expect(lines[1]).toMatch(/^\[known-failure\] #991 /);
    });

    it('the threshold is two seconds, under vitest\'s five', () => {
        expect(SLOW_TEST_MS).toBe(2000);
    });
});

// Two blind spots, both seen on 2026-11-17 (#1183). A beforeAll that timed out never reached the
// test's onTestFailed, so server-dom-entry's 10 s hook left no record; and the sweep's work is in the
// language server it spawns, so a starved server and a dead one both read "waiting, its event loop
// idle" with cpuShare 0. The planted failures run through the real setup file, in a vitest of their own.

/** Run one planted failure; the `[slow-test]` records it printed, parsed, and what it printed. */
function plantedRecords(fixture: string): { records: Record<string, unknown>[]; output: string } {
    const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'tests/slow-test-probe/vitest.config.ts', fixture], {
        cwd: join(__dirname, '..'), encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, CI: '1' },
    });
    const output = `${run.stdout}\n${run.stderr}`;
    expect(run.status, `the planted failure passed:\n${output}`).not.toBe(0);
    const records = output.split('\n').filter((l) => l.startsWith('[slow-test] '))
        .map((l) => JSON.parse(l.slice('[slow-test] '.length)) as Record<string, unknown>);
    // What the child vitest said, so a run with no record says why rather than only that.
    return { records, output: `the planted run printed:\n${output.slice(-4000)}` };
}

describe('the blind spots of #1183', () => {
    it('a beforeAll past its timeout prints a record that names the hook', () => {
        const { records, output } = plantedRecords('hook-timeout');
        expect(records, `the hook timed out with no record — ${output}`).toHaveLength(1);
        expect(records[0].test).toMatch(/^beforeAll hook \(hook-timeout\.fixture\.ts:\d+:\d+\)$/);
        expect(records[0].file).toMatch(/hook-timeout\.fixture\.ts$/);
        expect(records[0].wallMs as number).toBeGreaterThanOrEqual(SLOW_TEST_MS);
    }, 60_000);

    it('a test waiting on a child that spins reports the child\'s CPU, not 0', () => {
        const { records, output } = plantedRecords('child-cpu');
        expect(records, output).toHaveLength(1);
        const children = records[0].children as { label: string; alive: boolean; cpuShare: number }[];
        expect(children, 'the record does not name the child').toHaveLength(1);
        expect(children[0]).toMatchObject({ label: 'spinner', alive: true });
        // The child spun a core for the whole wait: its share is the work, the test's own is not.
        expect(children[0].cpuShare).toBeGreaterThanOrEqual(ON_CPU);
        expect(records[0].cpuShare as number).toBeLessThan(ON_CPU);
        expect(records[0].reading).toBe('waiting on a child that works on the CPU');
    }, 60_000);

    it('the hook is read from the stack vitest gives its error', () => {
        // As vitest 4.1 words it: the runner's frame names the hook, the next frame is where it was declared.
        const stack = [
            'Error: STACK_TRACE_ERROR',
            '    at beforeAll (file:///C:/repo/node_modules/.pnpm/@vitest+runner@4.1.12/node_modules/@vitest/runner/dist/chunk-artifact.js:670:26)',
            '    at C:/repo/packages/core/tests/server-dom-entry.test.ts:36:1',
        ].join('\n');
        expect(hookOf(stack)).toBe('beforeAll hook (server-dom-entry.test.ts:36:1)');
        expect(hookOf('Error: x\n    at foo (a.ts:1:1)')).toBe('a hook');
    });
});

describe('every vitest suite of the gate records its slow failures', () => {
    const PACKAGES = join(__dirname, '..', '..');
    // The suites `test:unit` runs: the packages whose `test` is `vitest run`, and their config.
    const CONFIGS = ['cli/vitest.config.ts', 'compiler/vite.config.ts', 'core/vite.config.ts', 'lsp/vite.config.ts', 'router/vite.config.ts', 'ui/vite.config.ts'];

    it('the list is every package whose test is vitest run', () => {
        const packages = ['builder', 'cli', 'compiler', 'core', 'design', 'framework', 'lsp', 'responsive', 'router', 'showcase', 'site', 'ui', 'vscode-pdx'];
        const vitest = packages.filter((p) => {
            const scripts = (JSON.parse(readFileSync(join(PACKAGES, p, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts;
            return scripts?.test === 'vitest run';
        });
        expect(vitest.sort()).toEqual(CONFIGS.map((c) => c.split('/')[0]).sort());
    });

    it('each one names the setup file', () => {
        const missing = CONFIGS.filter((c) => !/slow-test-record\.ts/.test(readFileSync(join(PACKAGES, c), 'utf8')));
        expect(missing).toEqual([]);
    });
});
