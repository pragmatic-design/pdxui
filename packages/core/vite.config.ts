// `vitest/config`, not `vite`: this file carries a `test` block, and Vite's own
// `defineConfig` has no such key — so the whole block would be untyped and a misspelt option in
// it silent. Same function, one key wider.
import { defineConfig } from 'vitest/config';
import { unitTestWorkers } from '../../build/unit-test-workers';

export default defineConfig({
    // d.ts come from `tsc` in the build script (declaration:true) — not vite-plugin-dts, because
    // its hard dep @microsoft/api-extractor pulls a won't-fix-vulnerable lodash into the dev tree.
    build: {
        lib: {
            // The barrel, and the devtools overlay on its own: `@pdxui/core/devtools` cannot point at
            // the barrel in a build, which has no `initDevTools`. Shared code is a shared chunk.
            entry: {
                'pragmatic-core': 'src/index.ts',
                devtools: 'src/devtools/overlay.ts',
            },
            // The IIFE is built separately, by vite.config.iife.ts, because it is the one
            // artefact with no bundler after it: it needs `process.env.NODE_ENV` replaced, and
            // replacing it HERE would bake the answer into the es/cjs output too, where the
            // consuming app is supposed to decide it.
            formats: ['es', 'cjs'],
            fileName: (format, entryName) => `${entryName}${format === 'es' ? '.es.js' : '.cjs'}`,
        },
        minify: 'esbuild',
        sourcemap: true,
        target: 'es2022',
        rollupOptions: {
            external: [],
        },
    },
    test: {
        environment: 'happy-dom',
        include: ['tests/**/*.test.ts'],
        // Its share of the machine, not all of it: `test:unit` runs four packages at once.
        maxWorkers: unitTestWorkers(),
        // tests/perf holds the benchmarks, and a benchmark taken inside `pnpm test` is not a
        // measurement: six packages compile in parallel there, so the clock reads the machine's
        // load as much as core's cost. They run — `pnpm test:perf`, alone, through
        // vitest.perf.config.ts — and tests/suite-hygiene.test.ts asserts that nothing in the
        // default run reads a stopwatch without declaring why.
        exclude: ['**/node_modules/**', '**/dist/**', 'tests/perf/**'],
        // Refuses an unstubbed fetch by name instead of opening a socket to happy-dom's default
        // origin (http://localhost:3000). See the file for what that costs.
        setupFiles: ['tests/setup/no-network.ts', 'tests/setup/gc-observer.ts'],
        // --expose-gc for the detector in gc-observer.ts: happy-dom drops a MutationObserver's
        // records after a collection, so a test that rests on one passes alone and fails at random
        // in the gate. Forcing the collection makes it fail always.
        // Top level, not `poolOptions`: Vitest 4 removed that nesting.
        execArgv: ['--expose-gc'],
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            reporter: ['text-summary', 'html'],
            // Ratchet thresholds: set just under current coverage so the gate catches regressions
            // without failing today. Raised in named steps, never lowered to whatever today is.
            //
            // A threshold nothing has ever cleared is not a ratchet; it is a permanent red, and a
            // permanent red stops being looked at.
            //
            // Measured, 2795 tests:
            //   statements 86.74 · branches 79.13 · functions 85.34 · lines 89.59
            // Each floor is max(the target 79/79/82/79, measured minus one). A point under, not a
            // decimal: repeated runs vary by ~0.03, and a floor at the exact current value would go red
            // on noise. Not the target alone: leaving statements at 79 with 86.7 measured would tolerate
            // a seven-point regression in silence.
            //
            // Do not raise a threshold here without the coverage to back it, and do not lower one
            // without saying why.
            //
            // Some of what stays uncovered no test can reach: the `isBrowser` false arm of every
            // composable, the SSR early-returns beside it, the cross-list `group` path in sortable.ts,
            // which is declared, warns, and is not implemented, the `static` loader mode — a
            // bundler-resolved dynamic import — and defensive arms with no caller.
            thresholds: { statements: 85, lines: 88, functions: 84, branches: 79 },
        },
    },
});
