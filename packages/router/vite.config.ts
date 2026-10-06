// `vitest/config`, not `vite`: this file carries a `test` block, and Vite's own
// `defineConfig` has no such key — so the whole block would be untyped and a misspelt option in
// it silent. Same function, one key wider.
import { defineConfig } from 'vitest/config';
import { unitTestWorkers } from '../../build/unit-test-workers';

export default defineConfig({
    build: {
        lib: {
            entry: {
                index: 'src/index.ts',
                outlet: 'src/outlet.ts',
                link: 'src/link.ts',
            },
            formats: ['es'],
            fileName: (_, name) => `${name}.js`,
        },
        minify: false,
        sourcemap: true,
        target: 'es2022',
        rollupOptions: {
            external: ['@pdxui/core', '@pdxui/compiler'],
        },
    },
    test: {
        environment: 'happy-dom',
        include: ['tests/**/*.test.ts'],
        // Its share of the machine, not all of it: `test:unit` runs four packages at once.
        maxWorkers: unitTestWorkers(),
        // The MutationObserver GC detector, shared with core and ui; needs --expose-gc below.
        setupFiles: ['../core/tests/setup/gc-observer.ts'],
        execArgv: ['--expose-gc'],
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            exclude: ['src/**/*.d.ts'],
            reporter: ['text-summary', 'html'],
            // Ratchet floor: just under current coverage. Catches regressions without failing today.
            // Raised in named steps, never lowered to whatever today happens to be.
            //
            // Measured: statements 87.01 · branches 78.78 · functions 90.42 · lines 91.04.
            // The rule is max(the target owed, measured minus one), because a floor far below the
            // measure would tolerate a regression the tests would otherwise catch.
            thresholds: { statements: 86, lines: 90, functions: 89, branches: 77 },
        },
    },
});
