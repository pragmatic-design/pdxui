// The pre-push says what the machine was doing when its suites started (#1182).
//
// A timeout in the gate could not tell the machine's load from the gate's own: the analysis on #991
// had to infer the other sessions' load from durations alone, and read the process list by hand,
// after the fact. scripts/lib/machine-load.mjs prints one line before the suites: the CPU in use over
// about a second, the free memory, and the vitest, Playwright and node processes already running that
// the gate did not start.

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpus } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuInUse, foreignProcesses, loadLine } from '../../../scripts/lib/machine-load.mjs';
import { KNOWN } from '../../../scripts/lib/known-failures.mjs';

const REPO = join(__dirname, '..', '..', '..');

const spinners: ChildProcess[] = [];

afterEach(() => {
    for (const child of spinners.splice(0)) child.kill();
});

/** Start `n` node processes that spin a core each, and resolve once each has started spinning. */
async function spin(n: number): Promise<number[]> {
    const started = Array.from({ length: n }, () => {
        const child = spawn(process.execPath, ['-e', "process.stdout.write('go\\n'); for (;;) {}"], { stdio: ['ignore', 'pipe', 'ignore'] });
        spinners.push(child);
        return new Promise<number>((resolve) => child.stdout!.once('data', () => resolve(child.pid!)));
    });
    return Promise.all(started);
}

describe('the machine\'s load', () => {
    it('the CPU in use includes the processes spinning beside it, and they are counted', async () => {
        // A quarter of the cores spin: whatever else the machine runs, the share in use is at least
        // theirs. The bound is their share, measured against the cores this machine has.
        const n = Math.max(1, Math.floor(cpus().length / 4));
        const pids = await spin(n);
        const inUse = await cpuInUse(1000);
        expect(inUse, `${n} of ${cpus().length} cores spinning`).toBeGreaterThanOrEqual((n / cpus().length) * 0.75);
        expect(inUse).toBeLessThanOrEqual(1);

        const found = foreignProcesses();
        for (const pid of pids) expect(found.node, `spinner ${pid} not counted`).toContain(pid);
    }, 30_000);

    it('the processes the gate started are not counted: this one and its ancestors', () => {
        const found = foreignProcesses();
        const all = [...found.vitest, ...found.playwright, ...found.node];
        expect(all).not.toContain(process.pid);
        expect(all).not.toContain(process.ppid);
    }, 30_000);

    it('the line carries the three figures', async () => {
        const line = await loadLine(200);
        expect(line).toMatch(/^\[machine-load\] cpu in use \d+% over 0\.2 s · free memory \d+\.\d GB of \d+\.\d GB · already running: \d+ vitest, \d+ playwright, \d+ node$/);
    }, 30_000);
});

describe('where the line is printed', () => {
    it('the pre-push prints it before the suites, in both of their forms', () => {
        const hook = readFileSync(join(REPO, '.githooks', 'pre-push'), 'utf8');
        const load = hook.indexOf('node scripts/lib/machine-load.mjs');
        expect(load, 'the hook does not print the load line').toBeGreaterThan(-1);
        expect(load).toBeLessThan(hook.indexOf('pnpm test ||'));
        expect(load).toBeLessThan(hook.indexOf('pnpm test:affected ||'));
    });

    it('the [known-failure] line of a gate timeout points at it', () => {
        expect(KNOWN.find((k) => k.issue === 991)?.evidence).toContain('[machine-load]');
    });
});
