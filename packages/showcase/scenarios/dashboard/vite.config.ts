import { defineConfig } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';
import { moduleList } from '../module-list';

/**
 * A dashboard — four `@defer` panels, one prefetched, a virtual list of 10,000 rows, one theme of
 * `@pdxui/design` (#245). What it weighs is held by `scenario-budgets.spec.ts`, and `modules.json`
 * says each panel's component is in a chunk of its own, not in the entry (L5). A production build.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false }), moduleList()],
    build: { target: 'es2022' },
});
