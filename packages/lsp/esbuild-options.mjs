// How the language server and the type-check are bundled: one place, read by build.mjs and by the
// tests that bundle the server themselves (tests/stdio-harness.ts), so the two cannot drift.
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const LSP_DIR = dirname(fileURLToPath(import.meta.url));

/** The options every LSP bundle shares; each build adds its entry, output and externals. */
export const bundleOptions = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    alias: {
        '@pdxui/compiler': resolve(LSP_DIR, '../compiler/src/index.ts'),
    },
    // The compiler is ES modules and reads `import.meta.url` (src/module-dir.ts); CommonJS has no
    // import.meta, and esbuild, unlike the compiler's own Rollup build, does not shim it: left alone
    // it bundles an empty object and warns. The bundle's own URL is the value a CJS file can give.
    banner: { js: "var __pdx_import_meta_url = require('url').pathToFileURL(__filename).href;" },
    define: { 'import.meta.url': '__pdx_import_meta_url' },
};
