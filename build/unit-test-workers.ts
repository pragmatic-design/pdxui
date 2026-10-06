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

import { availableParallelism } from 'node:os';

/** The packages `test:unit` runs together: the root script's `--workspace-concurrency`, asserted equal. */
export const UNIT_TEST_CONCURRENCY = 4;

/** How far past one worker per core the peak may go when every package runs at once. */
const OVERSUBSCRIPTION = 2;

/** One package's share of the cores, at least one. */
export function unitTestWorkers(): number {
    return Math.max(1, Math.floor(availableParallelism() * OVERSUBSCRIPTION / UNIT_TEST_CONCURRENCY));
}
