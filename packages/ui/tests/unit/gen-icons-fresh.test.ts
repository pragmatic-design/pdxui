// The icon modules and the loader map must still be what the icon set says (#47).
//
// `src/icon/pragmatic/<name>.ts` and `src/icon/pragmatic-loaders.ts` are generated from
// `pragmatic-icon-data.ts` by scripts/gen-icons.mjs, and committed: the compiler imports the modules,
// and development serves them as they are. An icon added to the set and not generated would be in
// `registerPragmaticIcons()` and nowhere else — the compiler would not import it and the resolver would
// call it outside the set. Regenerated in memory here, so a copy that drifts fails the gate.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { iconFiles } from '../../scripts/gen-icons.mjs';
import { PRAGMATIC_SVGS } from '../../src/icon/pragmatic-icon-data';

const MODULE_DIR = join(__dirname, '..', '..', 'src', 'icon', 'pragmatic');
const fresh = iconFiles(PRAGMATIC_SVGS) as Map<string, string>;

describe('the generated icon modules are what the set produces', () => {
    it('regenerated the whole set', () => {
        expect(Object.keys(PRAGMATIC_SVGS).length).toBeGreaterThan(300);
        expect(fresh.size, 'one module per icon, and the loader map').toBe(Object.keys(PRAGMATIC_SVGS).length + 1);
    });

    it('every generated file is committed as generated', () => {
        const differ = [...fresh].filter(([p, text]) => !existsSync(p) || readFileSync(p, 'utf8') !== text).map(([p]) => p);
        expect(differ, 'out of date — run: pnpm --dir packages/ui run icons').toEqual([]);
    });

    it('no module is left for an icon the set no longer has', () => {
        const stale = readdirSync(MODULE_DIR).filter(f => !fresh.has(join(MODULE_DIR, f)));
        expect(stale, 'stale icon modules — run: pnpm --dir packages/ui run icons').toEqual([]);
    });
});
