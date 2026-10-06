// The CDN bundle, built on its own because it is the one place with no bundler after it.
//
// Every other artefact this package publishes leaves `process.env.NODE_ENV` in the output on
// purpose: the consuming app's bundler replaces it, so their dev build keeps core's diagnostics and
// their production build folds them away with the branch. A `<script src="…iife.js">` has no such
// step — the expression would reach a browser that has no `process` and throw on the first line of
// the module — so this build replaces it here, with `production`.
//
// That means the CDN bundle carries no dev diagnostics.
//
// Run after the main build, with `emptyOutDir: false`, so it adds its file rather than replacing
// the es/cjs output.
import { defineConfig } from 'vite';

export default defineConfig({
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    build: {
        emptyOutDir: false,
        lib: {
            entry: 'src/index.ts',
            name: 'Pragmatic',
            formats: ['iife'],
            fileName: () => 'pragmatic-core.iife.js',
        },
        minify: 'esbuild',
        sourcemap: true,
        target: 'es2022',
        rollupOptions: {
            external: [],
        },
    },
});
