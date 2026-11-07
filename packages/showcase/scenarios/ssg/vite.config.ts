import { defineConfig } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';

/**
 * A generated app (#160): `pdx build --ssg` writes a page per route, and the app takes it over at
 * boot. Its own config registers pdx(), with hydrate, as an app built that way does.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false, hydrate: true })],
    build: { target: 'es2022' },
});
