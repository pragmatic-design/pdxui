// The benchmarks, run alone: `pnpm --filter @pdxui/compiler test:perf`.
//
// They are excluded from `pnpm test` on purpose. A wall-clock threshold — and worse, a wall-clock
// RATIO between two runs in the same process — measures the machine as much as the compiler, and
// `pnpm test` runs six packages in parallel. That makes a gate that goes red with nothing broken
// and green on the next run, which teaches the reader to re-run instead of look.
//
// `fileParallelism: false` for the same reason at a smaller scale: three benchmark files racing
// each other measure each other.

// `vitest/config`, not `vite`: this file carries a `test` block, and Vite's own
// `defineConfig` has no such key — so the whole block would be untyped and a misspelt option in
// it silent. Same function, one key wider.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/perf/**/*.test.ts'],
        fileParallelism: false,
    },
});
