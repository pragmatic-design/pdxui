/**
 * MANIFEST — pdx-divider
 *
 * Contracts DERIVED by inspecting the source (they are NOT in universal.ts):
 *   - Source: packages/ui/src/divider/pdx-divider.ts
 *       · orientation 'horizontal' (the default) with no label → <hr role="separator"> with
 *         inline `border:none;border-top:1px <variant> var(--pdx-color-border);margin:8px 0`.
 *         → an effective height of ~1px (a border-top only), and a large width (it fills the parent).
 *       · orientation 'vertical' → <div role="separator" aria-orientation="vertical"> with
 *         inline `display:inline-block;width:0;border-left:1px ...;min-height:1em`.
 *         → a width of ~0..1px (a border-left only), and a height >= 1em (~16px+).
 *       · with a label → <div role="separator">, a flex with two line <span>s and the label in between.
 *       · EVERY variant has role="separator".
 *
 * Note: light DOM → the rendered element (<hr>/<div>) is a child of the custom element.
 *     Selectors: `pdx-divider[data-test="..."] > hr|div` — the line is a direct child of the host,
 *     beside the slot: the late-slot watcher leaves it there.
 *
 * CONSERVATIVE contracts, true on all 13 themes: the border is a fixed 1px in the source
 * (not a token), but the operators are cautious ('<=', generous) to absorb a theme override.
 */
import type { ComponentManifest } from './_types';

export const divider: ComponentManifest = {
    name: 'divider',
    tag: 'pdx-divider',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/divider'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'divider-orientation',
            title: 'Divider — Horizontal & Vertical',
            html: `
                <div style="width:320px">
                    <div data-test="hwrap" style="width:300px">
                        <pdx-divider data-test="div-h" orientation="horizontal"></pdx-divider>
                    </div>
                    <div data-test="vwrap" style="height:60px;display:flex;align-items:stretch">
                        <span>A</span>
                        <pdx-divider data-test="div-v" orientation="vertical"></pdx-divider>
                        <span>B</span>
                    </div>
                </div>`,
        },
        {
            id: 'divider-label',
            title: 'Divider — With Label',
            html: `
                <div style="width:300px">
                    <pdx-divider data-test="div-label" label="OR" label-position="center"></pdx-divider>
                </div>`,
        },
        {
            // A row of links separated by vertical dividers, like the "Vertical" demo: the row wraps
            // (flex-wrap) the way the site's does. With width:100% on EVERY pdx-divider (undone only
            // by orient="vertical", which the component does not write), every divider would take a
            // row of its own and the entries would end up one per row.
            id: 'divider-vertical-row',
            title: 'Divider — Vertical, in a wrapping row',
            html: `
                <div data-test="vrow" style="width:400px;display:flex;flex-wrap:wrap;align-items:center;gap:8px">
                    <span data-test="vi1">Home</span>
                    <pdx-divider data-test="vd1" orientation="vertical"></pdx-divider>
                    <span data-test="vi2">Products</span>
                    <pdx-divider data-test="vd2" orientation="vertical"></pdx-divider>
                    <span data-test="vi3">About</span>
                </div>`,
        },
        {
            // The content's text is the label when `label` is missing: an <hr> in its place would make
            // "OR" disappear.
            id: 'divider-text-label',
            title: 'Divider — Text content as the label',
            html: `
                <div style="width:300px">
                    <pdx-divider data-test="div-text">OR</pdx-divider>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'divider-orientation': {
                standalone: [
                    {
                        // A horizontal <hr> is a border-top only → a small height.
                        selector: 'pdx-divider[data-test="div-h"] > hr',
                        description: 'horizontal divider is a thin line (height <= 4px)',
                        height: { op: '<=', value: 4 },
                    },
                    {
                        // It fills the 300px parent → a large width.
                        selector: 'pdx-divider[data-test="div-h"] > hr',
                        description: 'horizontal divider spans a wide width (>= 100px)',
                        width: { op: '>=', value: 100 },
                    },
                    {
                        // A vertical <div> is a border-left only → a small width.
                        selector: 'pdx-divider[data-test="div-v"] > div',
                        description: 'vertical divider is a thin column (width <= 4px)',
                        width: { op: '<=', value: 4 },
                    },
                    {
                        // min-height:1em → at least ~12px tall.
                        selector: 'pdx-divider[data-test="div-v"] > div',
                        description: 'vertical divider has a tall height (>= 12px)',
                        height: { op: '>=', value: 12 },
                    },
                ],
                composition: [
                    {
                        // The two orientations are geometrically opposite: horizontal is wide and short, vertical narrow and tall.
                        description: 'horizontal is wider than tall; vertical is taller than wide',
                        parent: 'body',
                        children: {
                            h: 'pdx-divider[data-test="div-h"] > hr',
                            v: 'pdx-divider[data-test="div-v"] > div',
                        },
                        relations: [
                            { description: 'horizontal width > vertical width', left: 'h.width', op: '>', right: 'v.width' },
                            { description: 'vertical height > horizontal height', left: 'v.height', op: '>', right: 'h.height' },
                        ],
                    },
                ],
            },
            'divider-label': {
                standalone: [
                    {
                        // With a label it is a wide flex container (it fills the parent's 300px).
                        selector: 'pdx-divider[data-test="div-label"] > div',
                        description: 'labelled divider spans a wide width (>= 100px)',
                        width: { op: '>=', value: 100 },
                    },
                    {
                        selector: 'pdx-divider[data-test="div-label"] > div',
                        description: 'labelled divider uses flex layout',
                        display: { op: 'is', value: 'flex' },
                    },
                ],
            },
            'divider-vertical-row': {
                standalone: [
                    {
                        // The host, not only the line inside it: it was as wide as the row (width:100%,
                        // 400px). Narrow = the line plus the two --pdx-space-sm margins (12px × the density:
                        // 25px at density 1), so 40px covers densities up to 1.5.
                        selector: 'section:not([hidden]) pdx-divider[data-test="vd1"]',
                        description: 'a vertical divider host is narrow (<= 40px)',
                        width: { op: '<=', value: 40 },
                    },
                ],
                composition: [
                    {
                        description: 'items separated by vertical dividers sit on one line',
                        parent: 'section:not([hidden]) [data-test="vrow"]',
                        children: {
                            first: 'section:not([hidden]) [data-test="vi1"]',
                            last: 'section:not([hidden]) [data-test="vi3"]',
                            divider: 'section:not([hidden]) pdx-divider[data-test="vd2"]',
                        },
                        relations: [
                            { description: 'first and last item share their top', left: 'first.top', op: '==', right: 'last.top', tolerance: 2 },
                            { description: 'the last item is to the right of the first', left: 'last.left', op: '>', right: 'first.right' },
                            { description: 'the divider sits between them', left: 'divider.left', op: '>', right: 'first.right' },
                        ],
                    },
                ],
            },
            'divider-text-label': {
                standalone: [
                    {
                        // The labelled branch: a flex with two lines and the text in between.
                        selector: 'section:not([hidden]) pdx-divider[data-test="div-text"] > div[role="separator"]',
                        description: 'text content renders the labelled divider',
                        display: { op: 'is', value: 'flex' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // role="separator" on every variant must pass WCAG cleanly.
        scenarios: ['divider-orientation', 'divider-vertical-row', 'divider-text-label'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'divider-orientation',
        targets: [
            // The horizontal divider must stay a thin line under hostile CSS.
            // An 8px tolerance (a pilot, to be refined).
            { selector: 'pdx-divider[data-test="div-h"] > hr', tolerancePx: 8 },
        ],
    },

    // ── Dim. 4: keyboard ──
    // A divider is NOT interactive (role="separator") → no keyboard section.

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['divider-orientation', 'divider-vertical-row'],
    },
};

export default divider;
