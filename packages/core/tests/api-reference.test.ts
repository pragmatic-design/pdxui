// The API reference is generated, and the debt it exposes is not allowed to grow.
//
// The page is generated from the code (packages/site/scripts/gen-api.mjs), so it cannot go stale —
// and an export with no TSDoc gets an entry that is a signature and nothing else. The count of
// undocumented exports is the generator's: it reads the same AST the page is built from, and it
// follows re-export chains to the doc written at the original declaration.
//
// What belongs here is the ratchet: the current count is the ceiling, and the day somebody adds an
// undocumented export the test names it.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { surfaceOfPackage, render, SKILL_OUT } from '../../site/scripts/gen-api.mjs';

const API_MD = join(__dirname, '..', '..', 'site', 'content', 'docs', 'api.md');

/**
 * The ratchet. It may never go up.
 *
 * It is 0. That means the next export added without a TSDoc block fails this test by name, which is
 * the state this ratchet exists to hold — do not raise it to make room for one.
 */
const UNDOCUMENTED_CEILING = 0;

describe('API reference', () => {
    const core = surfaceOfPackage('core') as Map<string, { doc: string; specifier: string }>;

    it('reads a public surface at all', () => {
        // A zero here would make every assertion below pass by measuring nothing.
        expect(core.size).toBeGreaterThan(300);
    });

    it('names the sub-path a symbol actually lives behind', () => {
        // The defect this page exists to prevent: `mount` is not in the barrel.
        expect(core.get('mount')?.specifier).toBe('@pdxui/core/testing');
        expect(core.get('initDevTools')?.specifier).toBe('@pdxui/core/devtools');
        expect(core.get('signal')?.specifier).toBe('@pdxui/core');
    });

    it('the committed page is what the generator produces now', () => {
        expect(existsSync(API_MD), 'run `pnpm --filter @pdxui/site run api`').toBe(true);
        expect(readFileSync(API_MD, 'utf8'), 'api.md is stale — regenerate it').toBe(render());
    });

    it('the skill carries the same page, generated, not edited', () => {
        // An agent looks in the skill, not on the site: without the reference there it reads core's
        // dist/index.d.ts to learn what it exports. The copy is written by the same generator, and
        // this is what catches a hand edit or a regeneration that forgot it.
        expect(existsSync(SKILL_OUT), 'run `pnpm --filter @pdxui/site run api`').toBe(true);
        // Line endings normalised, as skill-catalog-lockstep does: with core.autocrlf a checkout
        // writes CRLF, and that is not a hand edit.
        expect(readFileSync(SKILL_OUT, 'utf8').replace(/\r\n/g, '\n'), 'pdxui/references/api.md differs from the generated page').toBe(render());
    });

    it('reads the doc of an overloaded function, which is written above the FIRST declaration', () => {
        // An overloaded function is several declarations with one name; the doc block sits above the
        // first, and the implementation that follows has no comment of its own. Taking the last
        // declaration's doc reported `component` — which carries a full block with a worked example
        // — as undocumented, and inflated the debt below by 4.
        expect(core.get('component')?.doc, 'component has a TSDoc block at its first overload').toBeTruthy();
        expect(core.get('component')?.doc).toContain('Web Component');
    });

    it('the count of exports with no TSDoc does not grow', () => {
        const undocumented = [...core.entries()]
            .filter(([, v]) => !v.doc || v.doc.trim() === '')
            .map(([k]) => k)
            .sort();

        expect(
            undocumented.length,
            `exports with no TSDoc rose to ${undocumented.length}. Newly undocumented, or write the `
            + `doc: ${undocumented.slice(0, 12).join(', ')}…`,
        ).toBeLessThanOrEqual(UNDOCUMENTED_CEILING);
    });
});
