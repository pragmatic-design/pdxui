// What a test's process did between two instants (#991): read by `slow-test-record.ts`, which writes it
// for a failed test that ran over SLOW_TEST_MS, and by `tests/slow-test-record.test.ts`.
//
// Wall time alone says a test was slow. Beside it: how much of that time the event loop was busy
// (`eventLoopUtilization`), how much CPU the process used (`cpuUsage`, user and system), how long the
// collector ran (`gc` performance entries), and the heap against its limit. A loop that was busy while
// the CPU stood still was held off it — not scheduled, or in a synchronous wait on the disk; an idle
// loop waited on something outside; CPU time near the wall time was work, and collection when most of
// it was the collector's.

import { performance, PerformanceObserver, type EventLoopUtilization } from 'node:perf_hooks';
import { freemem } from 'node:os';
import { getHeapStatistics } from 'node:v8';
import { knownFailureLines } from '../../../../scripts/lib/known-failures.mjs';
import type { ChildReport } from './slow-test-children';

/** A failed test over this long gets a record: under vitest's 5 s timeout, over every scan alone. */
export const SLOW_TEST_MS = 2000;

/** One instant of the process. */
export interface Sample {
    at: number;
    elu: EventLoopUtilization;
    cpu: { user: number; system: number };
    gcMs: number;
}

/** What the process did between two samples, and what that reads as. */
export interface SampleReport {
    wallMs: number;
    /** The share of the wall time the event loop was not idle, 0..1. */
    loopBusy: number;
    /** CPU time over wall time; over 1 when worker threads add theirs. */
    cpuShare: number;
    gcMs: number;
    heapUsedMB: number;
    heapLimitMB: number;
    freeMemMB: number;
    /** The child processes the test named as the ones it waits on (#1183), when it named any. */
    children?: ChildReport[];
    reading: string;
}

// The collector's time, summed as it is reported. One observer per process, made on first use.
let gcTotal = 0;
let gcObserver: PerformanceObserver | null = null;
function watchGc(): void {
    if (gcObserver) return;
    gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) gcTotal += entry.duration;
    });
    gcObserver.observe({ entryTypes: ['gc'] });
}

/** The process now. */
export function takeSample(): Sample {
    watchGc();
    return { at: performance.now(), elu: performance.eventLoopUtilization(), cpu: process.cpuUsage(), gcMs: gcTotal };
}

const round = (n: number, digits = 2): number => Math.round(n * 10 ** digits) / 10 ** digits;
const MB = 1024 * 1024;

/** Under this share of the wall time with its loop busy, a process was waiting, its event loop idle. */
export const LOOP_BUSY = 0.3;
/**
 * Under this share of the wall time on the CPU, a process whose loop was busy was held off it; at or
 * over, it was working on it. A share, not the whole CPU: under the gate's parallel suites a process
 * that never yielded was granted 60% of one (#1133).
 */
export const ON_CPU = 0.3;

/**
 * What a process whose loop idled was waiting on, when it named the children it waits on: a child
 * gone, one working, or one that is itself held or waiting. Without children, null.
 */
function childReading(children: ChildReport[]): string | null {
    if (children.length === 0) return null;
    if (children.some((c) => !c.alive)) return 'waiting on a child that has exited';
    if (children.some((c) => c.cpuShare >= ON_CPU)) return 'waiting on a child that works on the CPU';
    return 'waiting on a child that is held off the CPU, or waiting itself';
}

/** What the process did from `start` to `end`, beside the children it waits on. */
export function describeSample(start: Sample, end: Sample, children: ChildReport[] = []): SampleReport {
    const wallMs = Math.max(end.at - start.at, 0.001);
    const elu = performance.eventLoopUtilization(end.elu, start.elu);
    const cpuMs = (end.cpu.user - start.cpu.user + end.cpu.system - start.cpu.system) / 1000;
    const gcMs = end.gcMs - start.gcMs;
    const loopBusy = elu.utilization;
    const cpuShare = cpuMs / wallMs;
    const heap = getHeapStatistics();
    let reading: string;
    if (gcMs > wallMs / 2) reading = 'collecting garbage';
    else if (loopBusy < LOOP_BUSY) reading = childReading(children) ?? 'waiting, its event loop idle';
    else if (cpuShare < ON_CPU) reading = 'held off the CPU: not scheduled, or in a synchronous wait';
    else reading = 'working on the CPU';
    return {
        wallMs: Math.round(wallMs),
        loopBusy: round(loopBusy),
        cpuShare: round(cpuShare),
        gcMs: Math.round(gcMs),
        heapUsedMB: Math.round(heap.used_heap_size / MB),
        heapLimitMB: Math.round(heap.heap_size_limit / MB),
        freeMemMB: Math.round(freemem() / MB),
        ...(children.length > 0 ? { children } : {}),
        reading,
    };
}

/** The runner's frame that names a hook, as vitest 4.1 stacks a hook's timeout. */
const HOOK_FRAME = /^\s*at (beforeAll|afterAll|beforeEach|afterEach) \(/;
/** A frame's location: `at fn (path:line:col)` or `at path:line:col`. */
const FRAME_AT = /^\s*at (?:.*?\()?(.*?):(\d+):(\d+)\)?\s*$/;

/**
 * The hook a suite's error came from, and where it was declared, read from the stack vitest gives a
 * hook's timeout: its runner frame names the hook, and the frame after it is the declaration.
 */
export function hookOf(stack: string): string {
    const lines = stack.split('\n');
    const i = lines.findIndex((l) => HOOK_FRAME.test(l));
    if (i < 0) return 'a hook';
    const hook = HOOK_FRAME.exec(lines[i])![1];
    const at = FRAME_AT.exec(lines[i + 1] ?? '');
    if (!at) return `${hook} hook`;
    return `${hook} hook (${at[1].replace(/\\/g, '/').split('/').pop()}:${at[2]}:${at[3]})`;
}

/** The line the gate log carries, searchable by its prefix. */
export function recordLine(test: string, file: string, report: SampleReport): string {
    return `[slow-test] ${JSON.stringify({ test, file, ...report })}`;
}

/**
 * The record, and after it the known failure it is (`scripts/lib/known-failures.mjs`, #1013): a fast
 * test timing out in the gate is #991 coming back, and the gate says so instead of someone recognising it.
 */
export function recordLines(test: string, file: string, report: SampleReport, error: string): string[] {
    return [recordLine(test, file, report), ...knownFailureLines({ file, title: test, error, slowTest: report }, 'this log')];
}

/**
 * What a failed test prints: a slow one its record and the known failure it is; a fast one only the
 * known failure, if it is one (#1027 — remove-tree's grandchild case fails in milliseconds).
 */
export function failureLines(test: string, file: string, report: SampleReport, error: string): string[] {
    if (report.wallMs >= SLOW_TEST_MS) return recordLines(test, file, report, error);
    return knownFailureLines({ file, title: test, error }, 'this log');
}
