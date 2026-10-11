// The LSP bundles are CommonJS, and the compiler they bundle is written as ES modules: what one
// format has and the other lacks has to be supplied by the build, or esbuild leaves it empty and
// says so on every build — `"import.meta" is not available with the "cjs" output format`, from
// compiler/src/module-dir.ts.
import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { build } from 'esbuild';
import { bundleOptions } from '../esbuild-options.mjs';

const LSP = join(__dirname, '..');

async function bundle(entry: string, external: string[]) {
    return build({
        ...bundleOptions,
        entryPoints: [join(LSP, 'src', entry)], external, write: false, logLevel: 'silent',
    });
}

describe('the LSP bundles', () => {
    it.each([
        ['server.ts', ['vscode']],
        ['typecheck.ts', ['typescript']],
    ])('%s bundles with no warning', async (entry, external) => {
        const result = await bundle(entry, external);
        expect(result.warnings.map(w => w.text)).toEqual([]);
    }, 60_000);

    it('gives the bundled compiler a real import.meta.url', async () => {
        const result = await bundle('server.ts', ['vscode']);
        const code = result.outputFiles[0].text;
        expect(/import_meta\s*=\s*\{\s*\}/.test(code), 'import.meta is bundled as an empty object').toBe(false);
        expect(code.includes('pathToFileURL(__filename)'), 'no import.meta.url derived from __filename').toBe(true);
    }, 60_000);
});
