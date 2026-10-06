// `vitest/config`, not `vite`: this file carries a `test` block, and Vite's own
// `defineConfig` has no such key — so the whole block would be untyped and a misspelt option in
// it silent. Same function, one key wider.
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { unitTestWorkers } from '../../build/unit-test-workers';

// Test-only Vite config. The LSP ships via build.mjs (esbuild); this config
// exists solely to give vitest a coverage gate consistent with the other packages.
export default defineConfig({
    // The same alias as the esbuild build: without it vitest does not resolve @pdxui/compiler
    // (its main points at an unbuilt dist/) and the tests that import it fail to load.
    resolve: {
        alias: { '@pdxui/compiler': resolve(__dirname, '../compiler/src/index.ts') },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        // Its share of the machine, not all of it: `test:unit` runs four packages at once.
        maxWorkers: unitTestWorkers(),
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            exclude: ['src/**/*.d.ts'],
            reporter: ['text-summary', 'html'],
            // Ratchet floor: just under current coverage. Raised in named steps, never lowered to
            // whatever today happens to be.
            //
            // Measured, 181 tests:
            //   statements 86.18 · branches 71.42 · functions 94.17 · lines 91.76
            // The targets are functions 90 and branches 68. `pnpm coverage` stops at the first
            // failing package, so a gate a package does not meet can go unseen behind another's.
            //
            // `server.ts` — the process that answers the editor — is covered by its own suite, not
            // through the capabilities under it. `template-projection.ts` decides the SCOPE every
            // template expression is checked in; `code-actions.ts` must produce no offer for an
            // inapplicable fix rather than a broken edit.
            //
            // Floors are max(the target owed, measured minus one), not the two target numbers: a
            // floor at 68 with 71.4 measured would tolerate a regression these tests would catch.
            thresholds: { statements: 85, lines: 90, functions: 93, branches: 70 },
        },
    },
});
