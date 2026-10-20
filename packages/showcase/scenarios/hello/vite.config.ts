import { defineConfig } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';
import { moduleList } from '../module-list';

/**
 * The smallest PDX app: one component, one signal, one button. What it weighs is the floor every
 * app pays, and `scenario-budgets.spec.ts` holds it.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false }), moduleList()],
    build: { target: 'es2022' },
});
