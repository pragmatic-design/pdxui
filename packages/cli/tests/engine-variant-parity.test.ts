// The theme engine writes pdx-button's rules in their compiled form (#512): its output reaches the CLI
// and the builder with no build step in between. This holds that form to the one the design build
// compiles from the equivalent `@variant` rule, against the real manifest — so the two cannot drift.

import { describe, it, expect } from 'vitest';
import { buttonVariantRule } from '../../design/src/engine/button-variant';
import { getLanguage, getLanguageIds } from '../../design/src/engine/languages';
import { expandLibraryVariants, type LibraryAxis } from '../../compiler/src/compiler/variant-css';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { manifestAxes } from '../../design/scripts/variant-build.mjs';

const axes = manifestAxes() as Map<string, LibraryAxis[]>;
const variantAxis = axes.get('pdx-button')?.find((a) => a.name === 'variant');

/** The selector list the design build compiles for `@variant pdx-button variant(v) { :scope > [data-part="root"]suffix }`. */
function compiled(value: string, suffix: string): string {
    const css = expandLibraryVariants(`@variant pdx-button variant(${value}) { :scope > [data-part="root"]${suffix} { x: y } }`, undefined, (tag) => axes.get(tag));
    return css.slice(0, css.indexOf(' {'));
}

describe('the engine\'s pdx-button rules are the design build\'s', () => {
    it('reads the button\'s variant axis from the manifest', () => {
        // The control: no axis would make every case below compare nothing.
        expect(variantAxis?.values).toContain('primary');
        expect(variantAxis?.native?.solid).toBe(variantAxis?.native?.primary);
    });

    for (const value of (variantAxis?.values ?? []).filter((v) => v !== 'solid')) {
        for (const suffix of ['', ':hover']) {
            it(`variant(${value})${suffix}`, () => {
                const engine = buttonVariantRule(value, suffix).split(', ').map((s) => s.replace(/^& /, '')).join(', ');
                expect(engine).toBe(compiled(value, suffix));
            });
        }
    }

    it('no design language styles a button variant through its class alone', () => {
        const bare: string[] = [];
        for (const id of getLanguageIds()) {
            const css = getLanguage(id).cssOverrides ?? '';
            // Match: a rule's selector list, up to its block. Groups: [1]=the list
            for (const m of css.matchAll(/(^|\})\s*([^{}]+)\{/g)) {
                const list = m[2];
                if (/\.pdx-(primary|secondary|outline|ghost|link|danger|success|warning|info)\b/.test(list) && !list.includes('pdx-button')) {
                    bare.push(`${id}: ${list.trim()}`);
                }
            }
        }
        expect(bare).toEqual([]);
    });
});
