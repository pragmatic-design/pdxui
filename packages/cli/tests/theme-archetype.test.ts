/**
 * THE ARCHETYPE PROMISE — "your brand in the X style".
 *
 * The archetype promise has two halves, and both are asserted here:
 *   1. SAFE  — any brand colour, in any archetype, yields a WCAG-AA-clean theme.
 *   2. STABLE — the archetype's personality (behaviour + vocabulary tokens) does NOT
 *               change with the brand. Same archetype × different brands = same
 *               personality, different colours. If a brand could alter the personality,
 *               "brand × archetype" would not be a real product concept.
 *
 * The companion guard (theme-fidelity.test.ts) checks the other direction: that each
 * language reproduces its own shipped theme.
 */
import { describe, it, expect } from 'vitest';
import { createTheme, getLanguageIds } from '@pdxui/design/engine';
import type { LanguageId } from '@pdxui/design/engine';

/** Deliberately awkward brands: mid, vivid, extreme-light, extreme-dark, achromatic. */
const BRANDS = [
    '#6442d6', // vivid purple (mid lightness)
    '#E8590C', // orange — collides with the canonical warning hue
    '#FF0000', // pure red — collides with danger
    '#00A86B', // green — collides with success
    '#ffee00', // near-white yellow (extreme lightness)
    '#111111', // near-black, achromatic (extreme + low chroma)
    'oklch(0.52 0.16 215)', // wide-gamut blue that hex would clip
];

/** Tokens that encode the archetype, i.e. must be brand-independent. */
const PERSONALITY = [
    '--pdx-button-radius', '--pdx-button-min-height', '--pdx-input-style',
    '--pdx-input-min-height', '--pdx-tab-indicator', '--pdx-tab-indicator-size',
    '--pdx-card-style', '--pdx-toggle-width', '--pdx-toggle-height',
    '--pdx-accordion-glyph', '--pdx-accordion-open-transform', '--pdx-breadcrumb-separator',
    '--pdx-table-header-transform', '--pdx-table-header-weight', '--pdx-table-header-size',
    '--pdx-table-header-letter-spacing', '--pdx-table-header-border-width',
    '--pdx-font-sans',
];

const LANGUAGES = getLanguageIds().filter((id) => id !== 'custom') as LanguageId[];

describe('archetype × any brand', () => {
    it('covers every registered design language', () => {
        expect(LANGUAGES.length).toBeGreaterThanOrEqual(12);
    });

    for (const language of LANGUAGES) {
        describe(language, () => {
            for (const brandColor of BRANDS) {
                it(`is WCAG-AA clean with brand ${brandColor}`, () => {
                    const theme = createTheme({ name: 'probe', brandColor, language });
                    const errors = theme.validate().filter((i) => i.level === 'error');
                    expect(errors.map((e) => `${e.code}: ${e.message}`)).toEqual([]);
                });
            }

            it('keeps its personality across every brand', () => {
                const reference = createTheme({ name: 'ref', brandColor: BRANDS[0], language }).tokens;
                for (const brandColor of BRANDS.slice(1)) {
                    const other = createTheme({ name: 'other', brandColor, language }).tokens;
                    for (const token of PERSONALITY) {
                        expect(other[token], `${token} changed with brand ${brandColor}`).toBe(reference[token]);
                    }
                }
            });

            it('still derives its colours FROM the brand (not a fixed palette)', () => {
                const a = createTheme({ name: 'a', brandColor: '#6442d6', language }).tokens;
                const b = createTheme({ name: 'b', brandColor: '#00A86B', language }).tokens;
                expect(a['--pdx-color-primary']).not.toBe(b['--pdx-color-primary']);
                expect(a['--pdx-hue-primary']).not.toBe(b['--pdx-hue-primary']);
            });
        });
    }
});
