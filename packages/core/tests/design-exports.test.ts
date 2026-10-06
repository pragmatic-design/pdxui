// A theme you cannot import is a theme that does not ship.
//
// A theme with no `exports` entry fails to resolve as `import '@pdxui/design/themes/metro'`, and
// nothing else notices, because `pragmatic-design.css` imports all thirteen: anyone doing
// `import '@pdxui/design'` gets every theme. The defect bites only the consumer who imports ONE
// theme by sub-path — which is the documented way to ship a single theme without the other twelve.
//
// The shape is a file list discovered by one thing and an exports map maintained by another, with
// nothing comparing them. This is the comparison.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { createRequire } from 'node:module';

const DESIGN = join(__dirname, '..', '..', 'design');
const THEMES_DIR = join(DESIGN, 'src', 'themes');

const pkg = JSON.parse(readFileSync(join(DESIGN, 'package.json'), 'utf-8')) as {
    // A target is a path, or a conditions object — `.`, `./base` and the themes ship `development`
    // (src, for this repository) and `default` (the flattened dist, for an install).
    exports: Record<string, string | Record<string, string>>;
};

/** Theme files on disk. `custom/` holds themes saved from the builder, which ship separately. */
const onDisk = readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.css'))
    .map(f => f.replace(/\.css$/, ''))
    .sort();

const exported = Object.keys(pkg.exports)
    .filter(k => k.startsWith('./themes/'))
    .map(k => k.replace('./themes/', ''))
    .sort();

describe('every shipped theme is importable by sub-path', () => {
    it('found the themes on disk', () => {
        // A zero here would make the comparison below pass by comparing nothing.
        expect(onDisk.length).toBeGreaterThan(10);
    });

    it('has an exports entry for each', () => {
        const missing = onDisk.filter(t => !exported.includes(t));
        expect(missing, 'these .css files ship but no sub-path resolves to them').toEqual([]);
    });

    it('exports no theme that is not on disk', () => {
        // The other direction: an entry pointing at a deleted file resolves to nothing at install time.
        const phantom = exported.filter(t => !onDisk.includes(t));
        expect(phantom, 'these sub-paths are declared and have no file').toEqual([]);
    });
});

describe('every exports target exists', () => {
    it('points at a real file, for every entry and not only the themes', () => {
        const broken = Object.entries(pkg.exports)
            .filter((e): e is [string, string] => typeof e[1] === 'string')
            .filter(([, target]) => !existsSync(join(DESIGN, target)))
            .map(([sub, target]) => `${sub} -> ${target}`);
        expect(broken, 'declared and not on disk').toEqual([]);
    });
});

describe('Node resolves them, not just the JSON', () => {
    // Reading the map is not the same statement as the resolver agreeing with it: a self-reference
    // (`@pdxui/design` from inside @pdxui/design) goes through the real exports algorithm,
    // conditions and all.
    const require = createRequire(join(DESIGN, 'package.json'));

    for (const theme of onDisk) {
        it(`resolves @pdxui/design/themes/${theme}`, () => {
            const resolved = require.resolve(`@pdxui/design/themes/${theme}`);
            expect(existsSync(resolved), resolved).toBe(true);
            expect(resolved.split(sep).join('/')).toContain(`themes/layered/${theme}.css`);
        });
    }
});

// ─── And what it resolves TO has to be layered ───────────────────
//
// The raw theme file carries no `@layer` of its own — it gets one from the `layer(pdx.themes)` on
// the import in `pragmatic-design.css`. A sub-path pointing at it would make the documented
// single-theme path produce UNLAYERED theme rules, and unlayered CSS beats everything inside a
// layer: the design system's first promise, "Consumer's unlayered CSS always wins (zero
// !important needed)", would be reversed by taking the saving it offers.
//
// Measured in the browser by `packages/design/tests/one-theme.spec.ts`. This is the cheap half:
// the entry a consumer resolves to must put its theme in `pdx.themes`, and no export may point at
// a raw theme file again.
describe('a theme imported on its own lands in the themes layer', () => {
    const require = createRequire(join(DESIGN, 'package.json'));

    for (const theme of onDisk) {
        it(`${theme}'s entry imports it into pdx.themes`, () => {
            const css = readFileSync(require.resolve(`@pdxui/design/themes/${theme}`), 'utf-8');
            expect(css, 'the entry does not declare the layer order, so `pdx.themes` takes its position from first use')
                .toContain('@layer pdx.reset,');
            expect(css, 'the theme is imported without a layer — its rules would beat the consumer')
                .toContain(`layer(pdx.themes)`);
        });
    }

    it('no export points at a raw theme file, in any condition', () => {
        // The entries carry `development` (src) and `default` (the flattened dist), so every
        // condition has to be checked — pointing one of the two at the raw file would make the
        // cascade depend on how the consumer resolved the package.
        const raw = Object.entries(pkg.exports)
            .filter(([sub]) => sub.startsWith('./themes/'))
            .flatMap(([sub, target]) => (typeof target === 'string' ? [[sub, 'default', target]] :
                Object.entries(target).map(([cond, t]) => [sub, cond, t])) as [string, string, string][])
            .filter(([, , t]) => !t.includes('/layered/') && !t.includes('/dist/themes/'))
            .map(([sub, cond, t]) => `${sub} (${cond}) -> ${t}`);
        expect(raw, 'these resolve to an unlayered theme').toEqual([]);
    });

    it('the generated entries are in step with the themes on disk', () => {
        // The generator is `packages/design/scripts/gen-theme-entries.mjs`. A theme added without
        // running it is a theme whose sub-path resolves to nothing.
        const layered = readdirSync(join(DESIGN, 'src', 'themes', 'layered'))
            .filter(f => f.endsWith('.css'))
            .map(f => f.replace(/\.css$/, ''))
            .sort();
        expect(layered, 'run `node packages/design/scripts/gen-layered-entries.mjs`').toEqual(onDisk);
    });
});
