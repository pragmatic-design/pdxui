import { defineConfig } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';

/**
 * The pilot's mount page with the library's TypeScript components (#685): the side the `.pdx`
 * rewrites are measured against, `tests/scenario-pilot-mount.spec.ts`. A production build.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false })],
    build: { target: 'es2022' },
});
