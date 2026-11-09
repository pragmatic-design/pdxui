import { defineConfig } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';

/**
 * A long virtual list in a generated app (#930): `pdx build --ssg` writes a page per route, each route
 * the same list with another `serverRows`, and the app takes it over at boot. What the count costs and
 * buys is measured by `scenario-ssg-virtual.spec.ts`.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false, hydrate: true })],
    build: { target: 'es2022' },
});
