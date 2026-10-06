import { defineConfig } from 'vite';
// A relative import (not through the package): esbuild bundles this config, and it resolves the
// compiler's extensionless internal imports. Importing '@pdxui/compiler' would externalise it
// and Node ESM would fail on './plugin'. The same pattern as the showcase.
import { pdx } from '../compiler/src/index';
import { markdownPlugin } from './src/lib/markdown/vite-markdown';
import { componentManifestsPlugin } from './src/lib/component-manifests-plugin';

// The PDX showcase site — all-PDX. The pdx() plugin auto-discovers the @pdxui/* packages
// (@pdxui/design's CSS included) and auto-imports the <pdx-*> components used in the
// templates. Static output in dist/ (deployment is handled elsewhere).
export default defineConfig({
    plugins: [markdownPlugin(), componentManifestsPlugin(), pdx({ devtools: false })],
    server: { port: 5300 },
    build: {
        outDir: 'dist',
        target: 'es2022',
        sourcemap: false,
    },
});
