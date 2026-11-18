// Planted for slow-test-record.test.ts (#1196): a test that waits on a spinning child, fails, and has
// its child stopped in afterEach — which vitest runs before the test's onTestFailed. Then a test that
// names no child, and fails: its record must not carry the first one's. Not part of any suite — its
// config, vitest.config.ts beside it, is run by that test alone.
import { afterEach, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { waitOnChild, stopWaitingOn } from '../setup/slow-test-children';

let child: ChildProcess | undefined;

afterEach(() => {
    if (!child) return;
    stopWaitingOn(child.pid!);
    child.kill();
    child = undefined;
});

it('waits on a child that works, stopped in afterEach', async () => {
    child = spawn(process.execPath, ['-e', "process.stdout.write('go'); for (;;) {}"], { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise((resolve) => child!.stdout!.once('data', resolve));
    waitOnChild(child.pid!, 'spinner');
    await sleep(2500);
    expect('the child', 'planted failure').toBe('done');
}, 10_000);

it('waits on nothing, and fails', async () => {
    await sleep(2500);
    expect('nothing', 'planted failure').toBe('done');
}, 10_000);
