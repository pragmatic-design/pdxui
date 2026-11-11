// The preview server's sockets around a failed test (#617).
//
// Under the full `pnpm test`, a preview server has refused a route chunk (ERR_CONNECTION_REFUSED) in
// the showcase's build and timing suites and in the site's, and the same spec passes alone right after.
// The two candidates — the loopback out of ports, a full listen backlog — are told apart by the socket
// table at the moment of the refusal, and nothing was reading it then.
//
// A reporter of the configs whose preview has refused. From the start of the run it reads the socket
// table every second (`netstat -ano` on Windows, `ss -tan` elsewhere) for the port of the config's
// webServer, and keeps the last 90 readings. When a test fails it reads once more and appends both to
// `sockets.jsonl` in the output folder. List it BEFORE keep-failed-runs.mjs: Playwright awaits each
// reporter's `onEnd` in order, and the keeper copies the folder in its own. `packages/core/tests/
// socket-sampler.test.ts` holds the parsing, the record and the configs.
//
// A reading is one child process a second, asynchronous, in the runner: it never blocks a test.

import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** How many readings a record carries: a test's 30 s timeout and a minute before it. */
export const KEEP = 90;

/** ss's state names, as netstat writes them: one vocabulary in the records of both systems. */
const SS_STATES = { ESTAB: 'ESTABLISHED', LISTEN: 'LISTENING' };

/** The port at the end of `host:port`, `[::1]:port` included; NaN for `*`. */
const portOf = (address) => Number(address.slice(address.lastIndexOf(':') + 1));

const bump = (counts, state) => { counts[state] = (counts[state] ?? 0) + 1; };

/**
 * One socket table, for `ports`: per port, whether something listens on it (and, from ss, its accept
 * queue and backlog), and the states of its server side and its client side; and how many sockets of
 * the whole machine are in TIME_WAIT.
 * @param {string} text the output of `netstat -ano` (win32) or `ss -tan`
 * @param {string} platform `process.platform`
 * @param {number[]} ports
 */
export function parseSockets(text, platform, ports) {
    /** @type {Record<number, { listening: boolean, acceptQueue?: number, backlog?: number, server: Record<string, number>, client: Record<string, number> }>} */
    const byPort = {};
    for (const port of ports) byPort[port] = { listening: false, server: {}, client: {} };
    let timeWait = 0;
    for (const line of text.split('\n')) {
        const cols = line.trim().split(/\s+/);
        let state, local, remote, recv, send;
        if (platform === 'win32') {
            if (cols[0] !== 'TCP' || cols.length < 4) continue;
            [, local, remote, state] = cols;
        } else {
            if (cols.length < 5 || cols[0] === 'State') continue;
            [state, recv, send, local, remote] = cols;
            state = SS_STATES[state] ?? state.replace(/-/g, '_');
        }
        if (state === 'TIME_WAIT') timeWait++;
        const server = byPort[portOf(local)];
        if (server && state === 'LISTENING') {
            server.listening = true;
            if (platform !== 'win32') { server.acceptQueue = Number(recv); server.backlog = Number(send); }
        } else if (server) bump(server.server, state);
        const client = byPort[portOf(remote)];
        if (client && state !== 'LISTENING') bump(client.client, state);
    }
    return { ports: byPort, timeWait };
}

/**
 * The port of a config's webServer: its `port`, or the port of its `url`.
 * @param {{ webServer?: { port?: number, url?: string } | null }} config
 * @returns {number[]}
 */
export function portsOf(config) {
    const server = config.webServer;
    if (!server) return [];
    if (server.port) return [server.port];
    const port = server.url ? Number(new URL(server.url).port) : NaN;
    return Number.isFinite(port) && port > 0 ? [port] : [];
}

/** The socket table of this machine, as text. */
function readTable(platform) {
    const [cmd, args] = platform === 'win32' ? ['netstat', ['-ano']] : ['ss', ['-tan']];
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
}

/** The reporter. Options are for its test: `read`, `platform`, `intervalMs`, `keep`. */
export default class SocketSampler {
    #read;
    #platform;
    #intervalMs;
    #keep;
    #ports = [];
    #outputDir = '';
    #start = 0;
    /** @type {object[]} */
    #samples = [];
    /** @type {ReturnType<typeof setInterval> | undefined} */
    #timer;
    #reading = false;
    /** @type {Promise<void>[]} */
    #pending = [];

    /** @param {{ read?: () => Promise<string>, platform?: string, intervalMs?: number, keep?: number }} [options] */
    constructor(options = {}) {
        this.#platform = options.platform ?? process.platform;
        this.#read = options.read ?? (() => readTable(this.#platform));
        this.#intervalMs = options.intervalMs ?? 1000;
        this.#keep = options.keep ?? KEEP;
    }

    /** One reading, stamped in ms since the run began; a table it could not read is an error, not a throw. */
    async #sample() {
        const t = Date.now() - this.#start;
        try {
            return { t, ...parseSockets(await this.#read(), this.#platform, this.#ports) };
        } catch (err) {
            return { t, error: String(err instanceof Error ? err.message : err) };
        }
    }

    /** @param {{ webServer?: object | null, projects: { outputDir: string }[] }} config Playwright's FullConfig. */
    onBegin(config) {
        this.#ports = portsOf(config);
        this.#outputDir = config.projects[0]?.outputDir ?? '';
        if (this.#ports.length === 0 || !this.#outputDir) return;
        this.#start = Date.now();
        this.#timer = setInterval(() => {
            // One reading at a time: a slow table under load is skipped, not stacked.
            if (this.#reading) return;
            this.#reading = true;
            void this.#sample().then((s) => {
                this.#samples.push(s);
                if (this.#samples.length > this.#keep) this.#samples.shift();
                this.#reading = false;
            });
        }, this.#intervalMs);
        this.#timer.unref?.();
    }

    /**
     * @param {{ expectedStatus: string, titlePath: () => string[] }} test Playwright's TestCase.
     * @param {{ status: string }} result Playwright's TestResult.
     */
    onTestEnd(test, result) {
        if (result.status === test.expectedStatus || result.status === 'skipped' || this.#timer === undefined) return;
        const before = this.#samples.slice();
        const title = test.titlePath().filter(Boolean).join(' › ');
        this.#pending.push(this.#sample().then((atFailure) => {
            const record = { test: title, status: result.status, at: new Date().toISOString(), atFailure, before };
            mkdirSync(this.#outputDir, { recursive: true });
            appendFileSync(join(this.#outputDir, 'sockets.jsonl'), `${JSON.stringify(record)}\n`);
        }));
    }

    /** Stops reading, and finishes the records still being written, before the keeper copies the folder. */
    async onEnd() {
        clearInterval(this.#timer);
        await Promise.all(this.#pending);
    }

    /** It prints nothing, and takes nothing from the config's own reporters. */
    printsToStdio() {
        return false;
    }
}
