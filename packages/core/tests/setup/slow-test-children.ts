// The child processes a test waits on, and the CPU they used (#1183).
//
// The `[slow-test]` record reads the test's own process. A test whose work is in a process it spawned
// — the LSP sweep, talking to its language server over stdio — idles while the child works, so a
// starved child and a dead one both read "waiting, its event loop idle" with cpuShare 0. A test names
// the children it waits on here; the record then carries their CPU time over the same window, and
// whether they were still alive.
//
// Read from the process table, with no dependency: `/proc/<pid>/stat` on Linux, `ps` elsewhere on
// POSIX, PowerShell's `Get-Process` on Windows (about 300 ms a read, measured on 2026-11-18). A read is
// taken only while a child is named, so a suite that names none pays nothing.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

/** One child's CPU time at an instant, or null when the process is gone. */
interface ChildReading { at: number; cpuMs: number | null }

/** A named child: where its window starts, and, once the test stopped waiting on it, its last report. */
interface Watched { label: string; base: ChildReading; stopped?: ChildReport }

const watched = new Map<number, Watched>();

/** What a record says of one child over its window. */
export interface ChildReport { pid: number; label: string; alive: boolean; cpuShare: number }

let clockTicks: number | null = null;
/** Linux's clock ticks per second, asked once: what `/proc/<pid>/stat` counts in. */
function ticksPerSecond(): number {
    clockTicks ??= Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
    return clockTicks;
}

/** The CPU time of each pid, in ms; a pid that is gone is absent. */
function cpuTimes(pids: number[]): Map<number, number> {
    const out = new Map<number, number>();
    if (pids.length === 0) return out;
    if (process.platform === 'win32') {
        // Ticks are 100 ns and integral: no decimal separator for the locale to change. A pid that is
        // gone is an answer, absent from the output; but Get-Process still exits 1 for it, told to
        // continue silently or not, so the script states its own success (#1196).
        const script = `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id) $($_.TotalProcessorTime.Ticks)" }; exit 0`;
        const text = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
        for (const line of text.split('\n')) {
            const m = /^(\d+) (\d+)/.exec(line.trim());
            if (m) out.set(Number(m[1]), Number(m[2]) / 10_000);
        }
        return out;
    }
    if (process.platform === 'linux') {
        for (const pid of pids) {
            let stat: string;
            try {
                stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue; // gone
                throw e;
            }
            // The command name, field 2, may hold spaces: count the fields after its closing paren.
            const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
            out.set(pid, ((Number(fields[11]) + Number(fields[12])) / ticksPerSecond()) * 1000);
        }
        return out;
    }
    // Other POSIX: `ps` gives the accumulated time as [[dd-]hh:]mm:ss, to the second.
    let text = '';
    try {
        text = execFileSync('ps', ['-o', 'pid=,time=', '-p', pids.join(',')], { encoding: 'utf8' });
    } catch (e) {
        // ps exits 1 when none of the pids is alive: that is an answer, not a failure.
        if ((e as { status?: number }).status !== 1) throw e;
    }
    for (const line of text.split('\n')) {
        const m = /^\s*(\d+)\s+(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)/.exec(line);
        if (m) out.set(Number(m[1]), (((Number(m[2] ?? 0) * 24 + Number(m[3] ?? 0)) * 60 + Number(m[4])) * 60 + Number(m[5])) * 1000);
    }
    return out;
}

/** The time the probe has spent reading children, in ms: its own, not the test's (#1196). */
let readingMs = 0;

function readNow(pids: number[]): Map<number, ChildReading> {
    const started = performance.now();
    const times = cpuTimes(pids);
    const at = performance.now();
    readingMs += at - started;
    return new Map(pids.map((pid) => [pid, { at, cpuMs: times.get(pid) ?? null }]));
}

/**
 * How long the probe has spent reading children, in all. A read is synchronous (PowerShell on Windows,
 * about 300 ms, more under the gate's load), so it holds the test's loop busy with no CPU of its own:
 * the sample takes it out of the window, or an idle test reads as held off the CPU.
 */
export function probeReadingMs(): number {
    return readingMs;
}

/** Name a child process the running test waits on: a slow failure's record reports its CPU. */
export function waitOnChild(pid: number, label: string): void {
    watched.set(pid, { label, base: readNow([pid]).get(pid)! });
}

/** One child's report over its window, from the reading that ends it. */
function reportOf(pid: number, w: Watched, end: ChildReading): ChildReport {
    const wall = Math.max(end.at - w.base.at, 0.001);
    const alive = end.cpuMs !== null;
    const used = alive && w.base.cpuMs !== null ? end.cpuMs! - w.base.cpuMs : 0;
    return { pid, label: w.label, alive, cpuShare: Math.round((used / wall) * 100) / 100 };
}

/**
 * The test no longer waits on it. vitest runs a test's onTestFailed after its afterEach, so a child
 * stopped there would be gone from the record a failure writes (#1196): its report is taken now, as it
 * was before the stop, kept for that record, and dropped as the next test starts.
 */
export function stopWaitingOn(pid: number): void {
    const w = watched.get(pid);
    if (!w || w.stopped) return;
    w.stopped = reportOf(pid, w, readNow([pid]).get(pid)!);
}

/** Whether any child is named: the probe reads none, and pays nothing, until one is. */
export function waitingOnChildren(): boolean {
    return watched.size > 0;
}

/**
 * Start every named child's window now: the probe calls it as a test starts. The children an earlier
 * test stopped waiting on are dropped first: they are not this test's.
 */
export function rebaseChildren(): void {
    for (const [pid, w] of watched) if (w.stopped) watched.delete(pid);
    if (watched.size === 0) return;
    const now = readNow([...watched.keys()]);
    for (const [pid, w] of watched) w.base = now.get(pid)!;
}

/** Each named child over its window: alive, and its CPU time over the wall time; a stopped one as it was. */
export function describeChildren(): ChildReport[] {
    if (watched.size === 0) return [];
    const live = [...watched].filter(([, w]) => !w.stopped).map(([pid]) => pid);
    const now = readNow(live);
    return [...watched].map(([pid, w]) => w.stopped ?? reportOf(pid, w, now.get(pid)!));
}
