import type { Plugin } from 'vite';

/**
 * Writes `modules.json` beside the bundle: for each chunk, the modules Rollup put code of in it. The
 * size says that the bundle grew; this says what came in, and where (`tests/scenario-budgets.spec.ts`).
 *
 * A module Rollup reached and then dropped all of — every call into it behind a `DEV` that folded,
 * as core's inspector is (#1246) — is listed in the chunk with nothing rendered, and is not in it.
 */
export function moduleList(): Plugin {
    return {
        name: 'pdx-scenario-module-list',
        generateBundle(_options, bundle) {
            const chunks: Record<string, string[]> = {};
            for (const [fileName, output] of Object.entries(bundle)) {
                if (output.type !== 'chunk') continue;
                chunks[fileName] = Object.entries(output.modules).filter(([, m]) => m.renderedLength > 0).map(([id]) => id);
            }
            this.emitFile({ type: 'asset', fileName: 'modules.json', source: JSON.stringify(chunks, null, 2) });
        },
    };
}
