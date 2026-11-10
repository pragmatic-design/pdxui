// A component written in .pdx is in the manifest as its TypeScript version is (#1003).
//
// The library moves to .pdx (#686), and custom-elements.json is what the compiler's auto-import, the
// LSP, the site, the skill catalogue, the variants and the certification registry read. A .pdx under
// src/ that the generator skipped would register its tag and be absent from all of them.
//
// The oracle is the TypeScript component: the pilot's .pdx rewrites are held to its unit tests and
// certification, and their manifest declaration must be the TypeScript one, field for field. Only the
// module's path differs.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { analyzeFile, parseCategories } from '../../scripts/gen-manifest.mjs';

const UI = join(__dirname, '..', '..');

interface Declaration { tagName: string; [key: string]: unknown }
interface Module { path: string; declarations: Declaration[]; exports: { declaration: { module: string } }[] }

function declarationOf(relPath: string): Declaration[] {
    const file = join(UI, relPath);
    const mods = analyzeFile(file, readFileSync(file, 'utf-8'), parseCategories()) as Module[];
    return mods.map((m) => m.declarations[0]);
}

// The switch's pair left when the switch moved to src/ (#1008): switch-is-pdx.test.ts holds its
// declaration to the one recorded from its TypeScript version.
const PAIRS = [
    { pdx: 'pilot/select.pdx', ts: 'src/select/pdx-select.ts' },
];

describe('a .pdx component in the manifest, against its TypeScript version', () => {
    for (const { pdx, ts } of PAIRS) {
        it(`${pdx} is read`, () => {
            const found = declarationOf(pdx);
            expect(found.map((d) => d.tagName)).toEqual(declarationOf(ts).map((d) => d.tagName));
        });

        it(`${pdx} declares what ${ts} declares`, () => {
            const [fromTs] = declarationOf(ts);
            const [fromPdx] = declarationOf(pdx);
            expect(fromPdx, 'the .pdx was not read').toBeDefined();
            // Field by field, and every field that differs at once, so a difference names its field
            // rather than the whole declaration.
            const keys = [...new Set([...Object.keys(fromTs), ...Object.keys(fromPdx)])].sort();
            const differing = keys
                .filter((key) => JSON.stringify(fromPdx[key]) !== JSON.stringify(fromTs[key]))
                .map((key) => ({ key, ts: fromTs[key], pdx: fromPdx[key] }));
            expect(differing).toEqual([]);
        });
    }

    it('the control: a TypeScript component is read as before', () => {
        expect(declarationOf('src/select/pdx-select.ts').map((d) => d.tagName)).toEqual(['pdx-select']);
    });
});
