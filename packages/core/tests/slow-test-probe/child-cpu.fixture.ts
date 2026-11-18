// Planted for slow-test-record.test.ts (#1183): a test that waits on a child process spinning the
// CPU, and fails. Its own process idles; the work is the child's, and the record must say so. Not
// part of any suite — its config, vitest.config.ts beside it, is run by that test alone.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { waitOnChild, stopWaitingOn } from '../setup/slow-test-children';

let child: ChildProcess;

beforeAll(async () => {
    child = spawn(process.execPath, ['-e', "process.stdout.write('go'); for (;;) {}"], { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise((resolve) => child.stdout!.once('data', resolve));
    waitOnChild(child.pid!, 'spinner');
});

afterAll(() => {
    stopWaitingOn(child.pid!);
    child.kill();
});

it('waits on a child that works', async () => {
    await sleep(2500);
    expect('the child', 'planted failure').toBe('done');
}, 10_000);
