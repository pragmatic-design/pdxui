// `vitest/config`, not `vite`: this file carries a `test` block, and Vite's own
// `defineConfig` has no such key — so the whole block would be untyped and a misspelt option in
// it silent. Same function, one key wider.
import { defineConfig } from 'vitest/config';
import { unitTestWorkers } from '../../build/unit-test-workers';

export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.ts',
            formats: ['es', 'cjs'],
            fileName: (format) => format === 'es' ? 'index.js' : 'index.cjs',
        },
        rollupOptions: {
            // Node builtins used by the plugin — keep external so they stay `import … from 'url'`
            // (ESM) / `require('url')` (CJS) instead of being browser-externalized to a stub.
            // typescript is external too (a runtime dependency: the AST signal-rewriter uses it,
            // and it's far too large to bundle).
            external: ['vite', 'path', 'fs', 'url', 'module', 'typescript'],
        },
        minify: false,
        sourcemap: true,
        target: 'es2022',
    },
    test: {
        include: ['tests/**/*.test.ts'],
        // Its share of the machine, not all of it: `test:unit` runs four packages at once.
        maxWorkers: unitTestWorkers(),
        // tests/perf holds the benchmarks, and a benchmark taken inside `pnpm test` is not a
        // measurement: six packages compile in parallel there, so the clock reads the machine's
        // load as much as the compiler's cost. They still run — `pnpm test:perf`, alone, via
        // vitest.perf.config.ts — and `tests/suite-hygiene.test.ts` asserts that nothing in the
        // default run reads a stopwatch, which a green run could never prove on its own.
        exclude: ['**/node_modules/**', '**/dist/**', 'tests/perf/**'],
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            reporter: ['text-summary', 'html'],
            // Ratchet thresholds: set just under current coverage so the gate catches regressions
            // without failing today. Raise over time.
            //
            // Coverage at the time the floor was set:
            //   statements 91.01 · branches 84.51 · functions 92.17 · lines 94.34
            // If this file fails, read the number before changing it: the floor is the ratchet, and
            // lowering it to whatever today happens to be is how a drift goes unnoticed.
            thresholds: { statements: 82, lines: 82, functions: 82, branches: 84 },
        },
    },
});
