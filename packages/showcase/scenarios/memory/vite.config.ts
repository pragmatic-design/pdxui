import { defineConfig } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';

/**
 * A page mounted and destroyed on demand, to measure whether it gives its memory back (#243):
 * `tests/scenario-memory.spec.ts`. A production build, as an app ships: diagnostics and devtools
 * stripped, so the measurement reads the heap and nothing internal.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false })],
    build: { target: 'es2022' },
});
