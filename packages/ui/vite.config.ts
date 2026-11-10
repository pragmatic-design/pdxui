// `vitest/config`, not `vite`: this file carries a `test` block, and Vite's own
// `defineConfig` has no such key — so the whole block would be untyped and a misspelt option in
// it would be silent. Same function, one key wider.
//
// The library build and its plugins are library-config.ts (#1004), shared with the test that builds a
// fixture library with them.
import { defineConfig } from 'vitest/config';
import { unitTestWorkers } from '../../build/unit-test-workers';
import { libraryBuild, libraryPlugins } from './library-config';

export default defineConfig({
    // The compiler, for a component written in .pdx: in the build, and in the unit tests that mount it.
    plugins: libraryPlugins(),
    ...libraryBuild(__dirname),
    test: {
        environment: 'happy-dom',
        include: ['tests/unit/**/*.test.ts'],
        // Its share of the machine, not all of it: `test:unit` runs four packages at once.
        maxWorkers: unitTestWorkers(),
        // The MutationObserver GC detector, one file for the three happy-dom packages that have one
        // (core owns it, next to its own setup). It needs --expose-gc below.
        // settle-prefetch keeps a file's environment up until its idle prefetches have loaded.
        setupFiles: ['../core/tests/setup/gc-observer.ts', 'tests/setup/settle-prefetch.ts', '../core/tests/setup/slow-test-record.ts'],
        execArgv: ['--expose-gc'],
    },
});
