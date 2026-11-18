// A sub-path runs what it types (#1015, #1213).
//
// A sub-path whose built code was the root bundle (`package.json` exports: `types` its own barrel,
// `import` the root) failed two ways, both invisible in dev, where the `development` condition runs the
// barrel's source:
//   • a name the barrel exports and the root does not was `undefined` once built: `setFallbackLocale`
//     threw in a reference app's production build (#1015);
//   • a name both export with different values was the ROOT's value: the renderer's `pipe` is the
//     template helper, the root's `pipe` the reactivity operator, so `import { pipe } from
//     '@pdxui/core/renderer'` got the other function (#1213).
// And a bundler that cannot tree-shake one module took the whole of core for one `signal`.
//
// So no public sub-path is built into the root bundle: each is an entry of vite.config.ts, built from
// the file it is typed and run from in development, sharing chunks with the root. That they share one
// reactive state once built is `packages/framework/tests/core-subpaths.test.ts`, on the packed dist.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import config from '../vite.config';

const CORE = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(CORE, 'package.json'), 'utf8')) as {
    exports: Record<string, { development?: string; types?: string; import?: string; require?: string }>;
};
const ROOT = pkg.exports['.'];
const subpaths = Object.entries(pkg.exports)
    .filter(([key, e]) => key !== '.' && typeof e === 'object' && e.development)
    .map(([key, e]) => ({ key, development: e.development!, built: e.import!, required: e.require }));

describe('no sub-path is built into the root bundle', () => {
    it('found the sub-paths, so the assertion below is not vacuous', () => {
        expect(subpaths.map((s) => s.key)).toEqual(expect.arrayContaining(['./reactivity', './renderer', './component', './i18n', './testing']));
    });

    it('none imports or requires the root bundle', () => {
        const intoRoot = subpaths.filter((s) => s.built === ROOT.import || s.required === ROOT.require).map((s) => s.key);
        expect(intoRoot, 'give each its own entry in vite.config.ts and point its export at it').toEqual([]);
    });
});

describe('a sub-path with an entry of its own', () => {
    const entries = (config.build?.lib && typeof config.build.lib === 'object' ? config.build.lib.entry : {}) as Record<string, string>;

    it.each(subpaths)('$key is built from the file it is typed and run from in development', ({ development, built, required }) => {
        // `./dist/<name>.es.js` is the entry `<name>` of vite.config.ts, and `./dist/<name>.cjs` its CommonJS.
        const name = /^\.\/dist\/(.+)\.es\.js$/.exec(built)?.[1];
        expect(name, `${built} is not an entry's es output`).toBeDefined();
        expect(resolve(CORE, entries[name!] ?? ''), `vite.config.ts has no entry '${name}' built from ${development}`).toBe(resolve(CORE, development));
        if (required !== undefined) expect(required, 'its require points at another entry than its import').toBe(`./dist/${name}.cjs`);
    });
});
