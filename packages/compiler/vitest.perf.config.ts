// The benchmarks, run alone: `pnpm --filter @pdxui/compiler test:perf`.
//
// They are excluded from `pnpm test` on purpose. A wall-clock threshold — and worse, a wall-clock
// RATIO between two runs in the same process — measures the machine as much as the compiler, and
// `pnpm test` runs six packages in parallel. That makes a gate that goes red with nothing broken
// and green on the next run, which teaches the reader to re-run instead of look.
//
// `fileParallelism: false` for the same reason at a smaller scale: three benchmark files racing
// each other measure each other.
//
// `testTimeout` of a minute: compiler-bench counts its budget in units of a reference it measures
// alongside (#643), so a busy machine slows both and the ratio holds. But each case is then ~130 runs
// of a compile and of the reference, about 1 s on an idle machine and 7 s with every other core
// spinning (measured), past vitest's default 5 s. A timeout there would fail the very load the ratio
// is there to absorb.

// `vitest/config`, not `vite`: this file carries a `test` block, and Vite's own
// `defineConfig` has no such key — so the whole block would be untyped and a misspelt option in
// it silent. Same function, one key wider.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/perf/**/*.test.ts'],
        fileParallelism: false,
        testTimeout: 60_000,
    },
});
