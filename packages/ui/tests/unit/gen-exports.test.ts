// The generator, not the symptom.
//
// Adding the three missing `exports` entries by hand fixes today and nothing else: the next
// component added to src/ would be discovered by gen-manifest.mjs and ignored by gen-exports.mjs
// exactly the same way, because the second only ever REWROTE entries that were already there. So
// gen-exports.mjs now reads the manifest and adds what it does not find, and this pins that.
//
// `computeExports` is pure for this reason — the script's file I/O is behind a `main()` that only
// runs when the file is executed, so importing it here cannot rewrite package.json.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { computeExports } from '../../scripts/gen-exports.mjs';

const mod = (path: string, tagName: string) => ({ path, declarations: [{ tagName }] });

describe('gen-exports adds what the manifest has and the exports map does not', () => {
    it('adds an entry for a component no export points at', () => {
        const { exports, added } = computeExports(
            { './button': { development: './src/button/pdx-button.ts' } },
            [mod('src/button/pdx-button.ts', 'pdx-button'), mod('src/page-header/pdx-page-header.ts', 'pdx-page-header')],
        );
        expect(added).toEqual(['./page-header ← src/page-header/pdx-page-header.ts']);
        expect(exports['./page-header']).toEqual({
            development: './src/page-header/pdx-page-header.ts',
            types: './dist/page-header/pdx-page-header.d.ts',
            import: './dist/page-header/pdx-page-header.js',
        });
    });

    it('leaves a component alone when an export already reaches it under another name', () => {
        // ./switch ← src/switch-toggle/pdx-switch.ts, ./sparkline ← src/chart/pdx-sparkline.ts:
        // the subpath is not the directory, so coverage is decided by the target file, not the name.
        const { added } = computeExports(
            { './switch': { development: './src/switch-toggle/pdx-switch.ts' } },
            [mod('src/switch-toggle/pdx-switch.ts', 'pdx-switch')],
        );
        expect(added).toEqual([]);
    });

    it('reports a collision instead of clobbering an existing subpath', () => {
        // Silently overwriting would leave the displaced component unresolvable — the same class of
        // failure, moved rather than fixed.
        const { added, collisions } = computeExports(
            { './card': { development: './src/card/pdx-card.ts' } },
            [mod('src/other/pdx-card.ts', 'pdx-card')],
        );
        expect(added).toEqual([]);
        expect(collisions).toHaveLength(1);
        expect(collisions[0]).toContain('./card');
    });

    it('still rewrites src targets to their dist mirror', () => {
        const { exports } = computeExports(
            { './button': { development: './src/button/pdx-button.ts' } },
            [],
        );
        expect(exports['./button']).toEqual({
            development: './src/button/pdx-button.ts',
            types: './dist/button/pdx-button.d.ts',
            import: './dist/button/pdx-button.js',
        });
    });

    it('keeps ./package.json last so the manifest stays resolvable', () => {
        const { exports } = computeExports({ './package.json': './package.json', './a': './dist/a.js' }, []);
        expect(Object.keys(exports).at(-1)).toBe('./package.json');
    });
});
