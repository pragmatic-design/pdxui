// How many vitest workers one package may take while `pnpm test:unit` runs the others beside it.
// Usage in each package's vitest config: import { unitTestWorkers } from '../../build/unit-test-workers';
//
// vitest's default is a worker per core, minus one. `test:unit` runs UNIT_TEST_CONCURRENCY packages
// at once, so the default asks for ~124 workers on 32 cores, and tests that do real work in their
// body time out at random while waiting for one. The machine is shared, so each package
// gets a share of it. `packages/core/tests/vitest-worker-budget.test.ts` holds every config to this.
//
// The share is TWICE the even split, and that is measured, not guessed. `pnpm -r` does not keep
// four packages running: compiler and core start nearly alone, and an even split leaves half the
// machine idle under them. `test:unit` wall time on 32 cores, green every run:
//
//   default (~31 each)            75.5 · 68.0 · 79.5 · 103.8 · 72.3 · 66.8 s    median ~74
//   even split (8 each)           140.4 · 121.3 · 141.5 · 140.8 · 152.3 s          median ~141
//   twice the split (16 each)     86.1 · 86.5 · 85.8 · 106.6 · 101.9 · 87.8 ·
//                                 115.5 · 92.3 s                                  median ~90  ← this
//
// At most 2 workers per core at the peak, instead of ~4, for about 15 seconds of a ~5-minute
// `pnpm test`. The runs are noisy (67–104 s for the same default), so read medians, not one run.
//
// Those numbers are for a machine the gate has to itself, and this one is not (#991): the owner runs
// several sessions on it at once, and on top of their load the gate's peak timed out tests that take
// milliseconds alone. So the pre-push samples the CPU free as it starts (scripts/lib/machine-load.mjs,
// #1182) and hands the share to the suites in PDX_CPU_FREE, and the cap scales by it: today's on an
// idle machine, in proportion below, one worker per package at the least. Without PDX_CPU_FREE — CI,
// a suite run by hand — the machine is taken as free. No timeout is raised for a busy machine.

import { availableParallelism } from 'node:os';

/** The packages `test:unit` runs together: the root script's `--workspace-concurrency`, asserted equal. */
export const UNIT_TEST_CONCURRENCY = 4;

/** How far past one worker per core the peak may go when every package runs at once. */
const OVERSUBSCRIPTION = 2;

/**
 * The share of the CPU free when the gate started, from PDX_CPU_FREE; 1 when it is not set. A value
 * that is not a share between 0 and 1 is refused: read as free, it would size the pools for an idle
 * machine on exactly the run that measured a busy one.
 */
export function cpuFreeShare(env: NodeJS.ProcessEnv = process.env): number {
    const raw = env.PDX_CPU_FREE;
    if (raw === undefined) return 1;
    const share = raw.trim() === '' ? NaN : Number(raw);
    if (!(share >= 0 && share <= 1)) {
        throw new Error(`PDX_CPU_FREE=${JSON.stringify(raw)} is not a share of the CPU between 0 and 1`);
    }
    return share;
}

/** One package's share of the cores, scaled by the CPU free, at least one. */
export function unitTestWorkers(free: number = cpuFreeShare()): number {
    return Math.max(1, Math.floor(availableParallelism() * OVERSUBSCRIPTION * free / UNIT_TEST_CONCURRENCY));
}
