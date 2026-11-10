// The library build of @pdxui/ui, as a function of the package it builds (#1004): vite.config.ts builds
// this package with it, and tests/unit/library-build-pdx.test.ts builds a fixture library with it, so
// what the test measures is what ships.
//
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
// Entry points are DERIVED from package.json "exports": every ./src/*.ts or ./src/*.pdx target
// becomes a rollup input, so standalone entries not reachable from the barrel (dialog-service,
// overlay-outlet, lucide-icons, …) are emitted too. Keep this the single source of truth —
// scripts/gen-exports.mjs rewrites the same exports map from src → dist after the build.
//
// A component written in .pdx is compiled by pdx(), with the library's prefix: `pdx-x.pdx` registers
// `<pdx-x>`. Its declaration is written after the build by scripts/gen-pdx-dts.mjs, from the
// compiler's own generator: tsc reads no .pdx.

import type { Plugin, UserConfig } from 'vite';
// From the compiler's sources, as the pilot does (pilot/plugin.ts): a config is not held to a dist
// that may be older than the compiler it builds with.
import { pdx } from '../compiler/src/index';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { libraryEntries } from './scripts/library-entries.mjs';

/** The plugins every build and test of the package runs: the compiler for its .pdx components. */
export function libraryPlugins(): Plugin[] {
    // `devtools: false`: a published module carries no development overlay, as an app ships (#685).
    return pdx({ prefix: 'pdx', devtools: false });
}

/** The library build of the package at `root`, into `outDir` (`dist` by default). */
export function libraryBuild(root: string, outDir = 'dist'): Pick<UserConfig, 'build'> {
    return {
        // d.ts are emitted by `tsc --emitDeclarationOnly` AFTER this build (see package.json) — not by
        // vite-plugin-dts, whose hard dep @microsoft/api-extractor pulls a vulnerable lodash.
        build: {
            target: 'es2022',
            minify: 'esbuild',
            outDir,
            lib: {
                entry: libraryEntries(root) as Record<string, string>,
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
    };
}
