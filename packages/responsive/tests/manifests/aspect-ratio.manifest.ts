/**
 * MANIFEST — pdx-aspect-ratio
 *
 * Contracts DERIVED by inspecting the source and the CSS:
 *   - Source: packages/ui/src/aspect-ratio/pdx-aspect-ratio.ts
 *       · the HOST <pdx-aspect-ratio> gets the class `pdx-aspect-ratio` plus an inline
 *         style.aspectRatio = ratio (default '16/9'), settato in requestAnimationFrame.
 *       · the content is projected through <slot> as a direct child (CSS: `> *`).
 *       · NOT interactive → no keyboard, no speed dial, no states.
 *   - CSS: packages/design/src/components/aspect-ratio.css
 *       · pdx-aspect-ratio { display:block }, .pdx-aspect-ratio { position:relative;
 *         width:100%; overflow:hidden }. `> *` forzato a width/height 100%, object-fit:cover.
 *
 * MEASUREMENT STRATEGY: the width is 100% of the parent → it is pinned with a wrapper of a known
 * width (320px). The height is derived by the browser from the aspect ratio applied: for 16/9,
 * height ≈ width * 9/16. The contract is a composition between the host's width and height (NOT
 * exact px: it checks the RELATION, with a tolerance). One scenario for 16/9 and one for 1/1.
 *
 * The selectors are ALWAYS scoped `section:not([hidden]) ...`. The host itself is the target
 * (`[data-test="ar"]`): the class and the inline aspect-ratio are on the host, not on an inner box.
 */
import type { ComponentManifest } from './_types';

export const aspectRatio: ComponentManifest = {
    name: 'aspect-ratio',
    tag: 'pdx-aspect-ratio',
    tier: '7',
    status: 'wip',
    imports: ['@pdxui/ui/aspect-ratio'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'aspect-ratio-16-9',
            title: 'Aspect Ratio — 16:9 (width fixed 320px)',
            // A wrapper of a known width → the host's width is deterministic (100% of 320).
            html: `
                <div style="width:320px">
                    <pdx-aspect-ratio data-test="ar-16-9" ratio="16/9">
                        <div data-test="ar-16-9-content" style="background:#888">16:9</div>
                    </pdx-aspect-ratio>
                </div>`,
        },
        {
            id: 'aspect-ratio-1-1',
            title: 'Aspect Ratio — 1:1 (square)',
            html: `
                <div style="width:320px">
                    <pdx-aspect-ratio data-test="ar-1-1" ratio="1/1">
                        <div data-test="ar-1-1-content" style="background:#888">1:1</div>
                    </pdx-aspect-ratio>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'aspect-ratio-16-9': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ar-16-9"]',
                        description: 'aspect-ratio host renders as a block box',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid'] },
                    },
                    {
                        // 100% of the wrapper's width (320px). A wide tolerance: the contract is the
                        // RELATION, not the exact value; this only checks the width is sensible.
                        selector: 'section:not([hidden]) [data-test="ar-16-9"]',
                        description: 'host fills its 320px wrapper width',
                        width: { op: '>=', value: 200 },
                    },
                ],
                composition: [
                    {
                        // 16:9 → height ≈ width * 9/16 = width * 0.5625. Checked through a bound: comparing
                        // height against width*0.5625 would need arithmetic on the right-hand side, and the
                        // relations model compares metrics between elements. So two targets are used:
                        // the real box (its height) and the wrapper as the source of the width.
                        // The robust invariant: for 16:9 the height is SMALLER than the width (landscape).
                        description: '16:9 box is landscape (height < width)',
                        parent: 'body',
                        children: {
                            box: 'section:not([hidden]) [data-test="ar-16-9"]',
                            box2: 'section:not([hidden]) [data-test="ar-16-9"]',
                        },
                        relations: [
                            { description: 'height < width (landscape ratio)', left: 'box.height', op: '<', right: 'box2.width' },
                        ],
                    },
                    {
                        // Containment: the projected content stays INSIDE the ratio box.
                        description: 'projected content is contained within the ratio box',
                        parent: 'section:not([hidden]) [data-test="ar-16-9"]',
                        children: {
                            host: 'section:not([hidden]) [data-test="ar-16-9"]',
                            content: 'section:not([hidden]) [data-test="ar-16-9-content"]',
                        },
                        relations: [
                            { description: 'content within host', left: 'content', op: 'contained-in', right: 'host' },
                            { description: 'content height <= host height', left: 'content.height', op: '<=', right: 'host.height', tolerance: 1 },
                            { description: 'content width <= host width', left: 'content.width', op: '<=', right: 'host.width', tolerance: 1 },
                        ],
                    },
                ],
            },
            'aspect-ratio-1-1': {
                composition: [
                    {
                        // 1:1 → height ≈ width (a square). The ratio's exact invariant.
                        description: '1:1 box is square (width == height)',
                        parent: 'body',
                        children: {
                            box: 'section:not([hidden]) [data-test="ar-1-1"]',
                            box2: 'section:not([hidden]) [data-test="ar-1-1"]',
                        },
                        relations: [
                            { description: 'width == height', left: 'box.width', op: '==', right: 'box2.height', tolerance: 2 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // A layout container, not interactive: a minimal scan for the absence of structural
        // violations (the demo content's contrast, for instance).
        scenarios: ['aspect-ratio-16-9'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'aspect-ratio-16-9',
        targets: [
            // Height = derived from the aspect-ratio + width (content/parent-driven): skip height;
            // the invariant is the ratio (checked in the contract), not an absolute height.
            { selector: 'section:not([hidden]) [data-test="ar-16-9"]', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard — N/A (the component is not interactive, omitted) ──

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['aspect-ratio-16-9'],
    },
};

export default aspectRatio;
