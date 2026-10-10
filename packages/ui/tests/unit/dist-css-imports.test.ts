// A component's styles travel with it — in the PUBLISHED package too.
//
// Each component imports its own stylesheet (`import '@pdxui/design/components/accordion'`). Inside
// this repository the `development` condition resolves every package to source, so that import
// always works here. An app installing from npm gets `dist/`, and the library build used to inline
// `@pdxui/design`: every import became `/* empty css */` and the CSS went into one `ui.css` with
// every component in it, which nothing documented and nothing loaded (#45).
//
// So this builds the package with its own config, in memory, and reads what would be published.

import { describe, it, expect, beforeAll } from 'vitest';
import { build, type Rollup } from 'vite';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

const UI = resolve(__dirname, '../..');
const SRC = join(UI, 'src');
const DESIGN_EXPORTS = Object.keys(
    (JSON.parse(readFileSync(join(UI, '../design/package.json'), 'utf-8')) as { exports: Record<string, unknown> }).exports,
);

/** `src/accordion/pdx-accordion.ts` → the `@pdxui/design/...` specifiers it imports for their side effect. */
function designImports(): Map<string, string[]> {
    const found = new Map<string, string[]>();
    const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) { walk(path); continue; }
            if (!path.endsWith('.ts')) continue;
            const specs = [...readFileSync(path, 'utf-8').matchAll(/^import\s+['"](@pdxui\/design[^'"]*)['"]/gm)].map((m) => m[1]);
            if (specs.length) found.set(relative(SRC, path).split(sep).join('/').replace(/\.ts$/, '.js'), specs);
        }
    };
    walk(SRC);
    return found;
}

let output: (Rollup.OutputChunk | Rollup.OutputAsset)[];
const sources = designImports();

beforeAll(async () => {
    const result = await build({
        configFile: join(UI, 'vite.config.ts'),
        root: UI,
        logLevel: 'silent',
        build: { write: false, emptyOutDir: false },
    });
    output = (Array.isArray(result) ? result : [result as Rollup.RollupOutput]).flatMap((r) => r.output);
}, 120_000);

describe('the published @pdxui/ui keeps each component\'s stylesheet import', () => {
    it('there are components that import their styles — the subject exists', () => {
        expect(sources.size).toBeGreaterThan(50);
    });

    it('every module that imports a stylesheet in source still imports it in dist', () => {
        const chunks = new Map(output.filter((o): o is Rollup.OutputChunk => o.type === 'chunk').map((c) => [c.fileName, c.code]));
        const lost: string[] = [];
        for (const [file, specs] of sources) {
            const code = chunks.get(file);
            if (code === undefined) { lost.push(`${file}: not emitted`); continue; }
            for (const spec of specs) if (!code.includes(`"${spec}"`) && !code.includes(`'${spec}'`)) lost.push(`${file}: ${spec}`);
        }
        expect(lost, 'these imports did not reach the published module').toEqual([]);
    });

    it('no module carries an import the build swallowed', () => {
        const swallowed = output.filter((o) => o.type === 'chunk' && o.code.includes('/* empty css')).map((o) => o.fileName);
        expect(swallowed).toEqual([]);
    });

    it('and no stylesheet of every component is emitted beside them', () => {
        const css = output.filter((o) => o.fileName.endsWith('.css')).map((o) => o.fileName);
        expect(css, 'a sheet of every component: an app that renders one would load them all').toEqual([]);
    });

    it('each specifier is one @pdxui/design exports, so the consumer\'s bundler resolves it', () => {
        const unknown = [...new Set([...sources.values()].flat())]
            .filter((spec) => !DESIGN_EXPORTS.includes('.' + spec.slice('@pdxui/design'.length)));
        expect(unknown).toEqual([]);
    });
});
