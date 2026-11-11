// A sub-path runs what it types (#1015).
//
// `@pdxui/core/i18n` and four other sub-paths take their types from their own barrel and, in a build,
// their code from the root bundle (`package.json` exports: `types` a sub-module, `import` the root). A
// name the barrel exports and the root does not typechecks, works in dev (the `development` condition
// is the barrel's source) and is `undefined` once built: `setFallbackLocale` threw in a reference app's
// production build. Every value the barrel exports must be one the root exports.
//
// Read with the type checker, not a regex: a barrel's `export *` is resolved as the bundle resolves it,
// and a type-only export is told from a value.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import config from '../vite.config';

const CORE = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(CORE, 'package.json'), 'utf8')) as {
    exports: Record<string, { development?: string; types?: string; import?: string }>;
};
const ROOT = pkg.exports['.'];

/** The sub-paths whose built code is the root bundle, with their barrel's source. */
const sharing = Object.entries(pkg.exports)
    .filter(([key, e]) => key !== '.' && e.import === ROOT.import && e.development)
    .map(([key, e]) => ({ key, barrel: resolve(CORE, e.development!) }));

const rootFile = resolve(CORE, ROOT.development!);
const program = ts.createProgram([rootFile, ...sharing.map((s) => s.barrel)], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true,
});
const checker = program.getTypeChecker();

/** The names a module exports that exist at run time: values, not types or interfaces. */
function valueExports(file: string): Set<string> {
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) throw new Error(`not a module: ${file}`);
    const out = new Set<string>();
    for (const sym of checker.getExportsOfModule(module)) {
        const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
        if (target.flags & ts.SymbolFlags.Value) out.add(sym.name);
    }
    return out;
}

describe('a sub-path built into the root bundle', () => {
    const root = valueExports(rootFile);

    it('found the sub-paths and the root\'s exports, so the assertion below is not vacuous', () => {
        expect(sharing.map((s) => s.key)).toEqual(expect.arrayContaining(['./reactivity', './renderer', './component']));
        expect(root.size).toBeGreaterThan(200);
    });

    it.each(sharing)('$key exports no value the root bundle lacks', ({ barrel }) => {
        const missing = [...valueExports(barrel)].filter((name) => !root.has(name)).sort();
        expect(missing, 'typed by the sub-path, undefined in a build: give it its own entry in vite.config.ts').toEqual([]);
    });
});

describe('a sub-path with an entry of its own', () => {
    const entries = (config.build?.lib && typeof config.build.lib === 'object' ? config.build.lib.entry : {}) as Record<string, string>;
    const own = Object.entries(pkg.exports)
        .filter(([key, e]) => key !== '.' && e.import !== ROOT.import && e.development)
        .map(([key, e]) => ({ key, development: e.development!, built: e.import! }));

    it('the i18n and testing sub-paths are among them (#1015)', () => {
        expect(own.map((o) => o.key)).toEqual(expect.arrayContaining(['./i18n', './testing']));
    });

    it.each(own)('$key is built from the file it is typed and run from in development', ({ development, built }) => {
        // `./dist/<name>.es.js` is the entry `<name>` of vite.config.ts.
        const name = /^\.\/dist\/(.+)\.es\.js$/.exec(built)?.[1];
        expect(name, `${built} is not an entry's es output`).toBeDefined();
        expect(resolve(CORE, entries[name!] ?? ''), `vite.config.ts has no entry '${name}' built from ${development}`).toBe(resolve(CORE, development));
    });
});
