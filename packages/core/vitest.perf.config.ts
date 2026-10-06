// The benchmarks, run alone: `pnpm --filter @pdxui/core test:perf`.
//
// They are excluded from `pnpm test` on purpose. An upper bound on elapsed time measures the
// machine as much as the code, and `pnpm test` runs six packages in parallel — a gate that goes
// red with nothing broken and green on the next run. The compiler's benchmarks run apart for the
// same reason. The environment is happy-dom, as in the default config: these
// benchmarks build DOM.
//
// `fileParallelism: false` for the same reason at a smaller scale: benchmark files racing each
// other measure each other.

// `vitest/config`, not `vite`: this file carries a `test` block, and Vite's own
// `defineConfig` has no such key — so the whole block would be untyped and a misspelt option in
// it silent. Same function, one key wider.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['tests/perf/**/*.test.ts'],
        setupFiles: ['tests/setup/no-network.ts'],
        fileParallelism: false,
    },
});
