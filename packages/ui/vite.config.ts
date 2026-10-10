// `vitest/config`, not `vite`: this file carries a `test` block, and Vite's own
// `defineConfig` has no such key — so the whole block would be untyped and a misspelt option in
// it would be silent. Same function, one key wider.
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { unitTestWorkers } from '../../build/unit-test-workers';

// Library build for PACKAGE consumption (Verdaccio / npm), not just the workspace.
// `preserveModules` mirrors src/ → dist/ one file per module so each export resolves to a
// real compiled file:
//   • "."          → dist/index.js               (the barrel — side-effect registers every <pdx-*>)
//   • "./button"   → dist/button/pdx-button.js    (granular, tree-shakeable subpath import)
// @pdxui/core stays external so a consuming app shares a single core instance
// (the customElements.define guard in core makes repeated registration idempotent).
// @pdxui/design stays external too, sub-paths included: each component imports its own stylesheet
// (`import '@pdxui/design/components/accordion'`), and that import has to reach the published
// module for the consumer's bundler to resolve. Inlined, it became `/* empty css */` and every
// component's CSS went into one `ui.css` nothing loaded (#45; tests/unit/dist-css-imports.test.ts).
//
// Entry points are DERIVED from package.json "exports": every ./src/*.ts target becomes a
// rollup input, so standalone entries not reachable from the barrel (dialog-service,
// overlay-outlet, lucide-icons, …) are emitted too. Keep this the single source of truth —
// scripts/gen-exports.mjs rewrites the same exports map from src → dist after the build.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
    exports: Record<string, string | Record<string, string>>;
};
const entries: Record<string, string> = {};
for (const entry of Object.values(pkg.exports)) {
    const targets = typeof entry === 'string' ? [entry] : Object.values(entry);
    for (const t of targets) {
        if (typeof t === 'string' && /^\.\/src\/.*\.ts$/.test(t)) {
            const rel = t.replace(/^\.\/src\//, '').replace(/\.ts$/, ''); // e.g. button/pdx-button
            entries[rel] = resolve(t.slice(2));
        }
    }
}

export default defineConfig({
    // d.ts are emitted by `tsc --emitDeclarationOnly` AFTER this build (see package.json) — not by
    // vite-plugin-dts, whose hard dep @microsoft/api-extractor pulls a vulnerable lodash.
    build: {
        target: 'es2022',
        minify: 'esbuild',
        lib: {
            entry: entries,
            formats: ['es'],
        },
        rollupOptions: {
            external: ['@pdxui/core', /^@pdxui\/design(\/|$)/],
            output: {
                preserveModules: true,
                preserveModulesRoot: 'src',
                entryFileNames: '[name].js',
            },
        },
    },
    test: {
        environment: 'happy-dom',
        include: ['tests/unit/**/*.test.ts'],
        // Its share of the machine, not all of it: `test:unit` runs four packages at once.
        maxWorkers: unitTestWorkers(),
        // The MutationObserver GC detector, one file for the three happy-dom packages that have one
        // (core owns it, next to its own setup). It needs --expose-gc below.
        setupFiles: ['../core/tests/setup/gc-observer.ts'],
        execArgv: ['--expose-gc'],
    },
});
