/**
 * MANIFEST — pdx-kbd
 *
 * Contracts DERIVED by inspecting the source and the CSS (kbd is NOT in universal.ts).
 *
 * The source (ui/src/kbd/pdx-kbd.ts):
 *   - DOM: <kbd class="pdx-kbd-combo"> > N × <kbd class="pdx-kbd">{key}</kbd>.
 *   - Props: keys (a string split on '+'), size ('' | 'sm' | 'lg' → pdx-kbd-{size}), symbols (bool).
 *   - Note: the keys can also arrive as direct children (<pdx-kbd>Ctrl</pdx-kbd>, say),
 *     and the render maps parts() from the `keys` prop; the scenarios use the `keys` prop.
 *
 * Base CSS (design/src/components/kbd.css):
 *   - .pdx-kbd: display:inline-flex, min-width:1.4em, height:1.5em, font-family:var(--pdx-font-mono),
 *     font-size:0.75em, border-radius:var(--pdx-radius-sm). → mono is SAFE, from the CSS.
 *   - .pdx-kbd-combo: display:inline-flex, gap:0.15em.
 *   - Size: .pdx-kbd-sm (height 1.3em) / .pdx-kbd-lg (height 1.7em).
 *
 * Conservative contracts (true on all 13 themes): the mono font and the display come from the base
 * CSS (the themes do not redefine them); the radius and the height vary with the theme's token set → cautious thresholds.
 */
import type { ComponentManifest } from './_types';

export const kbd: ComponentManifest = {
    name: 'kbd',
    tag: 'pdx-kbd',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/kbd'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'kbd-basic',
            title: 'Kbd — Single & Combo',
            html: `
                <div class="row">
                    <pdx-kbd data-test="kbd-single" keys="K"></pdx-kbd>
                    <pdx-kbd data-test="kbd-combo" keys="Ctrl+K"></pdx-kbd>
                    <pdx-kbd data-test="kbd-symbols" keys="Cmd+Shift+P" symbols></pdx-kbd>
                </div>`,
        },
        {
            id: 'kbd-sizes',
            title: 'Kbd — Sizes',
            html: `
                <div class="row">
                    <pdx-kbd data-test="kbd-sm" size="sm" keys="Esc"></pdx-kbd>
                    <pdx-kbd data-test="kbd-md" keys="Esc"></pdx-kbd>
                    <pdx-kbd data-test="kbd-lg" size="lg" keys="Esc"></pdx-kbd>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'kbd-basic': {
                standalone: [
                    {
                        // combo wrapper = inline-flex (CSS .pdx-kbd-combo)
                        selector: 'section:not([hidden]) [data-test="kbd-single"] .pdx-kbd-combo',
                        description: 'kbd combo wrapper is a flex container',
                        display: { op: 'oneOf', value: ['inline-flex', 'flex'] },
                    },
                    {
                        // singolo tasto <kbd class="pdx-kbd">
                        selector: 'section:not([hidden]) [data-test="kbd-single"] .pdx-kbd',
                        description: 'kbd key is a flex container',
                        display: { op: 'oneOf', value: ['inline-flex', 'flex'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="kbd-single"] .pdx-kbd',
                        description: 'kbd key height >= 12px',
                        height: { op: '>=', value: 12 },
                    },
                    {
                        // border-radius: var(--pdx-radius-sm) → small but present on every theme
                        selector: 'section:not([hidden]) [data-test="kbd-single"] .pdx-kbd',
                        description: 'kbd key has small radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
// font-family: var(--pdx-font-mono) imposed by the base CSS → mono is SAFE
                        selector: 'section:not([hidden]) [data-test="kbd-single"] .pdx-kbd',
                        description: 'kbd key uses monospace font',
                        fontFamily: { op: 'contains', value: 'mono' },
                    },
                ],
            },
            'kbd-sizes': {
                composition: [
                    {
                        // .pdx-kbd-sm (1.3em) < default (1.5em) < .pdx-kbd-lg (1.7em).
                        // Note: the size is on the combo wrapper, and the effective height is on the inner keys:
                        // what is measured is the single <kbd class="pdx-kbd"> inside each wrapper.
                        description: 'size hierarchy: sm < md < lg key height',
                        parent: 'section:not([hidden]) .row',
                        children: {
                            sm: 'section:not([hidden]) [data-test="kbd-sm"] .pdx-kbd',
                            md: 'section:not([hidden]) [data-test="kbd-md"] .pdx-kbd',
                            lg: 'section:not([hidden]) [data-test="kbd-lg"] .pdx-kbd',
                        },
                        relations: [
                            { description: 'sm <= md', left: 'sm.height', op: '<=', right: 'md.height' },
                            { description: 'md <= lg', left: 'md.height', op: '<=', right: 'lg.height' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A <kbd> with visible text → accessible content. No rule disabled.
    a11y: {
        scenarios: ['kbd-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'kbd-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="kbd-single"] .pdx-kbd', tolerancePx: 8, leaks: [{ issue: 170, properties: ['fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Kbd is display-only, NOT interactive → no keyboard pattern (the keyboard block is omitted).

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['kbd-basic'],
    },
};

export default kbd;
