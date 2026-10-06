// Every export of every published package resolves, for Node, to something Node can load.
//
// An export such as `@pdxui/design`'s `./engine` pointing at `./src/engine/index.ts` works inside this
// repository: the workspace links the source and a TypeScript-aware loader runs it. In an app that
// installed the package from a registry, Node refuses it — "Stripping types is currently unsupported
// for files under node_modules" — so `npx pdx theme`, the one command the `pdxui-theme` skill tells a
// consumer to run, cannot start. A consumer check that compiles a .pdx and never runs the CLI stays
// green on the same install.
//
// What Node loads is decided by the export conditions. `types` is for the type checker and may be
// TypeScript; `development` is opted into by Vite in this repo and may be TypeScript. What Node picks
// with no conditions of its own — `node`, then `import`, then `default`, or the bare string — may not.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = join(__dirname, '..', '..');

type ExportValue = string | null | { [condition: string]: ExportValue };

/** The target Node itself would load for one export entry, or null when there is none. */
function runtimeTarget(value: ExportValue): string | null {
    if (value === null) return null;
    if (typeof value === 'string') return value;
    for (const condition of ['node', 'import', 'default']) {
        if (condition in value) return runtimeTarget(value[condition]);
    }
    return null;
}

/** An export Node cannot load from node_modules: TypeScript source, not a declaration file. */
function isRawTypeScript(target: string): boolean {
    return /\.(?:m|c)?tsx?$/.test(target) && !/\.d\.(?:m|c)?ts$/.test(target);
}

function offenders(manifest: { name: string; exports?: Record<string, ExportValue> | string }): string[] {
    const exp = manifest.exports;
    if (!exp) return [];
    const entries: [string, ExportValue][] = typeof exp === 'string' ? [['.', exp]] : Object.entries(exp);
    return entries
        .filter(([key]) => !key.startsWith('//'))
        .map(([key, value]) => [key, runtimeTarget(value)] as const)
        .filter(([, target]) => target !== null && isRawTypeScript(target))
        .map(([key, target]) => `${manifest.name} "${key}" → ${target}`);
}

function publishedManifests() {
    return readdirSync(PACKAGES)
        .map(dir => join(PACKAGES, dir, 'package.json'))
        .filter(existsSync)
        .map(p => JSON.parse(readFileSync(p, 'utf-8')))
        .filter(m => m.private !== true && typeof m.name === 'string' && m.name.startsWith('@pdxui/'));
}

describe('the check can fail', () => {
    // A check that always returns [] passes the real assertion below perfectly.
    it('sees a TypeScript default', () => {
        expect(offenders({ name: 'probe', exports: { './x': './src/x.ts' } })).toHaveLength(1);
    });
    it('sees it behind conditions too', () => {
        expect(offenders({ name: 'probe', exports: { './x': { types: './x.d.ts', default: './src/x.ts' } } })).toHaveLength(1);
    });
    it('does not accuse types or development conditions, nor a declaration file', () => {
        expect(offenders({ name: 'probe', exports: {
            './a': { types: './src/a.ts', development: './src/a.ts', default: './dist/a.js' },
            './b': './dist/b.d.ts',
        } })).toEqual([]);
    });
});

describe('every published @pdxui/* export is loadable by Node', () => {
    const manifests = publishedManifests();

    it('found the published packages', () => {
        // Without this, a wrong path returns zero manifests and "no offenders" for the best of reasons.
        expect(manifests.map(m => m.name)).toEqual(expect.arrayContaining(['@pdxui/core', '@pdxui/design', '@pdxui/ui']));
    });

    it('has no export whose runtime target is TypeScript source', () => {
        expect(manifests.flatMap(offenders)).toEqual([]);
    });
});
