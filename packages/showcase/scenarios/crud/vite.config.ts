import { defineConfig } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';
import { moduleList } from '../module-list';

/**
 * One routed CRUD page — a named `@loader`, a `@form` of three fields, an `@action` that saves and
 * invalidates the loader, a `@for` of 100 rows (#245). What it weighs is what that page costs an app,
 * and `scenario-budgets.spec.ts` holds it. A production build, as an app ships.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false }), moduleList()],
    build: { target: 'es2022' },
});
