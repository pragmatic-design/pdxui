// A failed browser test records the preview server's sockets around its failure (#617).
//
// A route chunk refused by the preview (ERR_CONNECTION_REFUSED) has failed the showcase's build and
// timing suites and the site's, under the full `pnpm test`, five times since 2026-10-22, and never on
// its own. One healthy run was sampled by hand: nothing near loopback exhaustion or the listen backlog.
// A refusing run has never been sampled, because nothing was sampling when it happened.
//
// `scripts/lib/socket-sampler.mjs` is a reporter of those three configs. It reads the socket table
// every second for the port of the config's webServer, keeps the last 90 samples, and for a failed test
// appends them, with one read at the failure, to `sockets.jsonl` in the output folder, which the keeper
// reporter then copies where no rerun empties it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import SocketSampler, { parseSockets, portsOf, KEEP } from '../../../scripts/lib/socket-sampler.mjs';
import { waitUntil } from './wait-until';

const REPO = join(__dirname, '..', '..', '..');

// Trimmed from a real `netstat -ano` of this machine: the preview listens on IPv6 only.
const NETSTAT = `
Connessioni attive

  Proto  Indirizzo locale          Indirizzo esterno        Stato           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       2212
  TCP    127.0.0.1:50001        127.0.0.1:9000         TIME_WAIT       0
  TCP    [::1]:5311             [::]:0                 LISTENING       4120
  TCP    [::1]:5311             [::1]:52345            ESTABLISHED     4120
  TCP    [::1]:5311             [::1]:52346            TIME_WAIT       0
  TCP    [::1]:52345            [::1]:5311             ESTABLISHED     7000
  TCP    [::1]:52347            [::1]:5311             TIME_WAIT       0
  TCP    [::1]:52348            [::1]:5311             SYN_SENT        7000
  UDP    0.0.0.0:5353           *:*                                    3000
`;

// The shape of `ss -tan` on Linux, where the listening row carries the accept queue and the backlog.
const SS = `State      Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN     3      511          [::1]:5311          [::]:*
ESTAB      0      0            [::1]:5311         [::1]:40001
TIME-WAIT  0      0            [::1]:40002        [::1]:5311
TIME-WAIT  0      0        127.0.0.1:41000    127.0.0.1:9000
CLOSE-WAIT 1      0            [::1]:5311         [::1]:40003
`;

describe('parseSockets', () => {
    it('reads netstat: the port\'s server side, its client side, whether it listens, and the machine\'s TIME_WAIT', () => {
        expect(parseSockets(NETSTAT, 'win32', [5311])).toEqual({
            ports: {
                5311: {
                    listening: true,
                    server: { ESTABLISHED: 1, TIME_WAIT: 1 },
                    client: { ESTABLISHED: 1, TIME_WAIT: 1, SYN_SENT: 1 },
                },
            },
            timeWait: 3,
        });
    });

    it('reads ss, with the listening socket\'s accept queue and backlog, in netstat\'s state names', () => {
        expect(parseSockets(SS, 'linux', [5311])).toEqual({
            ports: {
                5311: {
                    listening: true,
                    acceptQueue: 3,
                    backlog: 511,
                    server: { ESTABLISHED: 1, CLOSE_WAIT: 1 },
                    client: { TIME_WAIT: 1 },
                },
            },
            timeWait: 2,
        });
    });

    it('says a port nobody listens on is not listening: a server gone is a finding, not a gap', () => {
        expect(parseSockets(NETSTAT, 'win32', [5314]).ports[5314]).toEqual({ listening: false, server: {}, client: {} });
    });
});

describe('portsOf', () => {
    it('takes the port of the webServer\'s url, or its port', () => {
        expect(portsOf({ webServer: { url: 'http://localhost:5311/' } })).toEqual([5311]);
        expect(portsOf({ webServer: { port: 5251 } })).toEqual([5251]);
        expect(portsOf({ webServer: null })).toEqual([]);
    });
});

describe('the reporter', () => {
    let out: string;
    beforeEach(() => { out = mkdtempSync(join(tmpdir(), 'pdx-sockets-')); });
    afterEach(() => { rmSync(out, { recursive: true, force: true }); });

    const config = () => ({ webServer: { url: 'http://localhost:5311/' }, projects: [{ outputDir: out }] });
    const test = (title: string) => ({ expectedStatus: 'passed', titlePath: () => ['', 'chunks.spec.ts', title] });

    it('writes the samples before a failed test, and one read at the failure, to sockets.jsonl', async () => {
        let reads = 0;
        const sampler = new SocketSampler({ intervalMs: 5, read: async () => { reads++; return NETSTAT; }, platform: 'win32' });
        sampler.onBegin(config());
        await waitUntil(() => reads >= 3, 'three readings');
        sampler.onTestEnd(test('a refused chunk'), { status: 'timedOut' });
        await sampler.onEnd();
        const [line, ...rest] = readFileSync(join(out, 'sockets.jsonl'), 'utf8').trim().split('\n');
        expect(rest).toEqual([]);
        const record = JSON.parse(line);
        expect(record.test).toBe('chunks.spec.ts › a refused chunk');
        expect(record.status).toBe('timedOut');
        expect(record.before.length, 'no sample from before the failure').toBeGreaterThan(1);
        expect(record.before[0].ports[5311].listening).toBe(true);
        expect(typeof record.before[0].t).toBe('number');
        expect(record.atFailure.ports[5311].server).toEqual({ ESTABLISHED: 1, TIME_WAIT: 1 });
        expect(reads).toBeGreaterThan(2);
    });

    it('writes nothing for a test that passed, and stops reading when the run ends', async () => {
        // Fake timers: "nothing reads after the end" is the clock moved on, not a window waited out.
        vi.useFakeTimers();
        try {
            let reads = 0;
            const sampler = new SocketSampler({ intervalMs: 5, read: async () => { reads++; return NETSTAT; }, platform: 'win32' });
            sampler.onBegin(config());
            await vi.advanceTimersByTimeAsync(20);
            expect(reads, 'the clock moved and nothing read: the control failed').toBeGreaterThan(0);
            sampler.onTestEnd(test('fine'), { status: 'passed' });
            await sampler.onEnd();
            const after = reads;
            await vi.advanceTimersByTimeAsync(50);
            expect(existsSync(join(out, 'sockets.jsonl'))).toBe(false);
            expect(reads, 'it kept reading after the run ended').toBe(after);
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps the last readings, not the whole run: 90 of them, a minute before a 30 s timeout', async () => {
        expect(KEEP).toBe(90);
        let reads = 0;
        const sampler = new SocketSampler({ intervalMs: 1, keep: 3, read: async () => `${reads++}`, platform: 'win32' });
        sampler.onBegin(config());
        await waitUntil(() => reads >= 7, 'seven readings');
        sampler.onTestEnd(test('late'), { status: 'failed' });
        await sampler.onEnd();
        const record = JSON.parse(readFileSync(join(out, 'sockets.jsonl'), 'utf8').trim());
        expect(record.before).toHaveLength(3);
        // The latest three, in order: the oldest went first.
        const ts = record.before.map((s: { t: number }) => s.t);
        expect(ts).toEqual([...ts].sort((a, b) => a - b));
    });

    it('records a table it could not read as an error, and does not fail the run', async () => {
        let reads = 0;
        const sampler = new SocketSampler({ intervalMs: 5, read: async () => { reads++; throw new Error('ss: not found'); }, platform: 'linux' });
        sampler.onBegin(config());
        await waitUntil(() => reads >= 1, 'one reading');
        sampler.onTestEnd(test('x'), { status: 'failed' });
        await sampler.onEnd();
        const record = JSON.parse(readFileSync(join(out, 'sockets.jsonl'), 'utf8').trim());
        expect(record.atFailure.error).toContain('ss: not found');
    });

    it('does not take the terminal from the config\'s own reporters', () => {
        expect(new SocketSampler().printsToStdio()).toBe(false);
    });
});

/** The configs whose preview server has refused a chunk under the gate (#617). */
const REFUSING = [
    'packages/showcase/tests/playwright.config.ts',
    'packages/showcase/tests/playwright.timing.config.ts',
    'packages/site/tests/playwright.config.ts',
];

describe('the configs whose preview has refused a chunk', () => {
    it.each(REFUSING)('%s samples its sockets, before the keeper copies the output folder', (rel) => {
        const file = join(REPO, rel);
        const src = readFileSync(file, 'utf8');
        const reporter = /reporter:\s*\[([\s\S]*?)\]\s*,\s*\n/.exec(src)?.[1] ?? '';
        const named = [...reporter.matchAll(/['"]([^'"]*\.mjs)['"]/g)].map((m) => resolve(dirname(file), m[1]));
        const sampler = named.indexOf(join(REPO, 'scripts', 'lib', 'socket-sampler.mjs'));
        const keeper = named.indexOf(join(REPO, 'scripts', 'lib', 'keep-failed-runs.mjs'));
        expect(sampler, 'the sampler is not a reporter of this config').toBeGreaterThanOrEqual(0);
        // Playwright awaits each reporter's onEnd in order: the sampler's last writes land before the copy.
        expect(sampler, 'the keeper copies the folder before the sampler has written to it').toBeLessThan(keeper);
    });
});
