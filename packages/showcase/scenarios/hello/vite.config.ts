import { defineConfig, type Plugin } from 'vite';
// Relative, as in the showcase's own config: esbuild bundles this file and resolves the compiler's
// extensionless internal imports.
import { pdx } from '../../../compiler/src/index';

/**
 * Writes `modules.json` beside the bundle: for each chunk, the modules Rollup put in it. The size
 * says that the bundle grew; this says what came in (`tests/scenario-budgets.spec.ts`).
 */
function moduleList(): Plugin {
    return {
        name: 'pdx-scenario-module-list',
        generateBundle(_options, bundle) {
            const chunks: Record<string, string[]> = {};
            for (const [fileName, output] of Object.entries(bundle)) {
                if (output.type === 'chunk') chunks[fileName] = Object.keys(output.modules);
            }
            this.emitFile({ type: 'asset', fileName: 'modules.json', source: JSON.stringify(chunks, null, 2) });
        },
    };
}

/**
 * The smallest PDX app: one component, one signal, one button. What it weighs is the floor every
 * app pays, and `scenario-budgets.spec.ts` holds it.
 */
export default defineConfig({
    plugins: [pdx({ devtools: false }), moduleList()],
    build: { target: 'es2022' },
});
