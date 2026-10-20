import type { Plugin } from 'vite';

/**
 * Writes `modules.json` beside the bundle: for each chunk, the modules Rollup put in it. The size
 * says that the bundle grew; this says what came in, and where (`tests/scenario-budgets.spec.ts`).
 */
export function moduleList(): Plugin {
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
