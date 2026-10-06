import { defineConfig } from 'vite';
// A relative import (not through the package name): esbuild bundles this config and resolves the
// compiler's extensionless internal imports. Importing '@pdxui/compiler' would externalise it
// and Node ESM would fail on './plugin'. The same pattern as the site.
import { pdx } from '../compiler/src/index';
import { mockAttachments } from './mock-attachments';
import { mockAuth } from './mock-auth';

/**
 * The showcase — a service desk written in PDX, and the bench the production build is measured on.
 *
 * `devtools: false` for the same reason the site does it: the overlay is dev-only, and a bundle
 * budget measured with it in would measure the wrong thing.
 *
 * No `minify` override and no `target` beyond es2022: the numbers this app produces are meant to be
 * the numbers an application gets from `pdx build` with nothing tuned.
 *
 * `PDX_INLINE_BINDINGS=1` builds the same app through the inline render path instead, which is how
 * the two are measured against each other. It is an env switch and not a second config
 * on purpose: the two builds must differ in exactly one option.
 */
export default defineConfig({
    // `mockAttachments` serves `/api/attachments` in dev AND in preview, slowly on purpose: a
    // TransferHandle's `progress` only means something if it can be watched moving.
    // `mockAuth` serves `/api/auth` and `/api/account`: it signs a real JWT and verifies it on
    // every protected call, so the login slice exercises the store rather than a stub.
    plugins: [
        // `defaultLayout`: the rail and the bar (`src/shell.pdx`) around every page that declares no
        // layout, and none around the sign-in, which says `@layout 'none'`.
        pdx({ devtools: false, inlineBindings: process.env.PDX_INLINE_BINDINGS === '1', defaultLayout: 'shell' }),
        mockAttachments(), mockAuth(),
    ],
    server: { port: 5310 },
    build: {
        outDir: 'dist',
        target: 'es2022',
        sourcemap: false,
        rollupOptions: {
            // An import of a name its module does not export fails the build, as it fails in dev,
            // where the browser refuses the module. Rollup only WARNS when the binding is unused, so
            // `import type { DataSource }`, merged into the runtime import, would build clean and
            // break `/tickets` in dev only. Every other warning is Rollup's.
            onwarn(warning, warn) {
                if (warning.code === 'MISSING_EXPORT') throw new Error(warning.message);
                warn(warning);
            },
        },
    },
});
