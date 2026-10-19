import { defineConfig } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';

/**
 * A kept-alive route page and a kept `<component :is>` view, to measure that a frozen page costs no
 * CPU (#269): `tests/scenario-lifecycle.spec.ts`. A production build, as an app ships.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false })],
    build: { target: 'es2022' },
});
