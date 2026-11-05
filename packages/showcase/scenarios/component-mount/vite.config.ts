import { defineConfig } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';

/**
 * Every component of @pdxui/ui on one page, mounted 100 at a time (#865):
 * `tests/scenario-component-mount.spec.ts`. A production build.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false })],
    build: { target: 'es2022' },
});
