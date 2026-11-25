#!/usr/bin/env node
/**
 * machine-load — what the machine is doing when the gate's suites start (#1182).
 *
 * A timeout in the pre-push could not tell the machine's load from the gate's own: the analysis on
 * #991 inferred the other sessions' load from durations alone, and read the process list by hand,
 * after the fact. The pre-push prints this line before its suites, and the `[known-failure]` line of
 * a gate timeout points at it:
 *
 *   [machine-load] cpu in use 37% over 1.0 s · free memory 41.2 GB of 63.7 GB · already running: 1 vitest, 0 playwright, 12 node
 *
 * - CPU in use: the busy share of every core's time over the sample, from `os.cpus()`. Not
 *   `os.loadavg()`, which is [0, 0, 0] on Windows.
 * - Already running: the processes the gate did not start, counted by command line. A process whose
 *   command line names Playwright (its runner, or a browser it launched) is `playwright`; a node
 *   process naming vitest is `vitest`; any other node process is `node`. This process and its
 *   ancestors — the hook, git, the shell — are the gate's, and are left out.
 *
 * - Vitest workers per package: what `unitTestWorkers()` gives for the CPU free, beside what it gives
 *   on an idle machine. The pre-push hands the free share to the suites in PDX_CPU_FREE, and every
 *   vitest config sizes its pool from it (#991).
 *
 *   node scripts/lib/machine-load.mjs                 prints the line
 *   node scripts/lib/machine-load.mjs --free-share    prints the line on stderr, the free share on stdout
 */
import { execFileSync } from 'node:child_process';
import { cpus, freemem, totalmem } from 'node:os';
import { pathToFileURL } from 'node:url';
import { unitTestWorkers } from '../../build/unit-test-workers.ts';

/** Every core's busy and total time, summed. */
function cpuTimes() {
    let busy = 0;
    let total = 0;
    for (const { times } of cpus()) {
        const all = times.user + times.nice + times.sys + times.irq + times.idle;
        total += all;
        busy += all - times.idle;
    }
    return { busy, total };
}

/**
 * The share of the machine's CPU time in use over `ms` milliseconds, between 0 and 1.
 * @param {number} [ms]
 * @returns {Promise<number>}
 */
export async function cpuInUse(ms = 1000) {
    const before = cpuTimes();
    await new Promise((resolve) => setTimeout(resolve, ms));
    const after = cpuTimes();
    const total = after.total - before.total;
    return total > 0 ? (after.busy - before.busy) / total : 0;
}

/**
 * The Windows process table from what `ConvertTo-Json -Compress` wrote for it. Windows PowerShell
 * leaves some control characters raw inside a string, and JSON.parse refuses them: a process whose
 * command line held one broke the pre-push line (#1409). Compressed, none of them is structural once
 * the trailing line break is trimmed, so each is written as the `\u00XX` escape JSON reads.
 * @param {string} json
 * @returns {{ pid: number, ppid: number, name: string, command: string }[]}
 */
export function parseWindowsProcessTable(json) {
    // Match: one raw character U+0000–U+001F
    const escaped = json.trim().replace(/[\u0000-\u001f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    return JSON.parse(escaped).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: p.Name ?? '', command: p.CommandLine ?? '' }));
}

/** The process table: `{ pid, ppid, name, command }`. */
function processTable() {
    if (process.platform === 'win32') {
        const json = execFileSync('powershell', [
            '-NoProfile', '-Command',
            'Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Compress',
        ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        return parseWindowsProcessTable(json);
    }
    const out = execFileSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/)).filter(Boolean)
        .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), name: m[3], command: m[4] }));
}

/** This process and its ancestors, as far as the table has them. */
function ownLine(table) {
    const byPid = new Map(table.map((p) => [p.pid, p]));
    const own = new Set([process.pid]);
    let pid = process.ppid;
    while (pid && !own.has(pid)) {
        own.add(pid);
        pid = byPid.get(pid)?.ppid;
    }
    return own;
}

const isNode = (p) => /^node(\.exe)?$/i.test(p.name);

/**
 * The vitest, Playwright and node processes running that this process and its ancestors are not, by PID.
 * @returns {{ vitest: number[], playwright: number[], node: number[] }}
 */
export function foreignProcesses() {
    const table = processTable();
    const own = ownLine(table);
    const found = { vitest: [], playwright: [], node: [] };
    for (const p of table) {
        if (own.has(p.pid)) continue;
        if (/playwright/i.test(p.command)) found.playwright.push(p.pid);
        else if (isNode(p) && /vitest/i.test(p.command)) found.vitest.push(p.pid);
        else if (isNode(p)) found.node.push(p.pid);
    }
    return found;
}

const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1);

/**
 * The share of the CPU free, from the share in use, at two decimals: the value PDX_CPU_FREE carries,
 * so the line and the vitest configs size the pools from the same number.
 * @param {number} inUse
 * @returns {number}
 */
export function freeShareOf(inUse) {
    return Math.round((1 - inUse) * 100) / 100;
}

/**
 * The machine as the gate starts: the line the pre-push prints, and the free share it hands on.
 * @param {number} [ms]
 * @returns {Promise<{ line: string, free: number }>}
 */
export async function readMachine(ms = 1000) {
    // The CPU first: listing the processes spawns PowerShell, which would load the sample.
    const inUse = await cpuInUse(ms);
    const found = foreignProcesses();
    const free = freeShareOf(inUse);
    const line = `[machine-load] cpu in use ${Math.round(inUse * 100)}% over ${(ms / 1000).toFixed(1)} s`
        + ` · free memory ${gb(freemem())} GB of ${gb(totalmem())} GB`
        + ` · already running: ${found.vitest.length} vitest, ${found.playwright.length} playwright, ${found.node.length} node`
        + ` · vitest workers per package: ${unitTestWorkers(free)} of ${unitTestWorkers(1)}`;
    return { line, free };
}

/**
 * The line the pre-push prints.
 * @param {number} [ms]
 * @returns {Promise<string>}
 */
export async function loadLine(ms = 1000) {
    return (await readMachine(ms)).line;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const { line, free } = await readMachine();
    if (process.argv.includes('--free-share')) {
        console.error(line);
        console.log(String(free));
    } else {
        console.log(line);
    }
}
