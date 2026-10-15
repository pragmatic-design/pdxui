/**
 * MANIFEST — pdx-rating
 *
 * NEW contracts, derived by inspecting:
 *  - source: packages/ui/src/rating/pdx-rating.ts
 *      the HOST <pdx-rating> → render: an inner <div class="pdx-rating [pdx-rating-{size}]
 *        [pdx-rating-disabled] [pdx-rating-readonly] [pdx-rating-focused]"
 *        role="slider" :aria-valuenow :aria-valuemin="0" :aria-valuemax="count"
 *        :aria-label="label" (default 'Rating') :aria-disabled :aria-readonly
 *        :tabindex="disabled ? -1 : 0">
 *          <span class="pdx-rating-star pdx-rating-star-{full|half|empty}"> ... <svg class="pdx-rating-icon"/> </span> × count
 *          [<input type="hidden">]  // only with a name
 *      The styled class .pdx-rating is on the INNER div, NOT on the host. Scope to "... .pdx-rating".
 *      Keyboard: onKeydown on the slider div → ArrowRight/Up (+precision), ArrowLeft/Down (-precision),
 *      Home (0), End (max). It is NOT roving over the stars: the focus stays on the single role="slider" div.
 *      So the pattern is 'none' with a single Tab → the focus on the div, then the arrows with expectFocusWithin
 *      (the focus must stay INSIDE the component; the value changes through an emit or a prop = async).
 *  - CSS: packages/design/src/components/rating.css
 *      .pdx-rating → display: inline-flex; cursor: pointer; outline: none.
 *      .pdx-rating-star → display: inline-flex; cursor: inherit.
 *      .pdx-rating-icon → width/height 1.25rem (sm 1rem, lg 1.75rem) → gerarchia size.
 *      .pdx-rating-disabled → opacity: var(--pdx-opacity-disabled) (< 1); cursor: not-allowed; pointer-events: none.
 *      .pdx-rating-readonly → cursor: default.
 *
 * a11y: role="slider" + aria-valuenow/min/max + aria-label (an accessible name is there,
 * 'Rating' by default; the scenario passes an explicit label). No disableRules.
 *
 * Conservative rules: only invariants true on ALL themes. No exact px.
 * Disabled: a state already in the markup → a STANDALONE rule (opacity < 1), not a StateRule (no timing flake).
 */
import type { ComponentManifest } from './_types';

export const rating: ComponentManifest = {
    name: 'rating',
    tag: 'pdx-rating',
    tier: '3C',
    status: 'wip',
    imports: ['@pdxui/ui/rating'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'rating-basic',
            title: 'Rating — Basic',
            // label → the aria-label on the role="slider"; value=3 of 5.
            html: `<pdx-rating data-test="rating" label="Product rating" value="3" count="5"></pdx-rating>`,
        },
        {
            id: 'rating-sizes',
            title: 'Rating — Sizes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; align-items: flex-start;">
                    <pdx-rating data-test="rating-sm" label="Small rating" value="3" count="5" size="sm"></pdx-rating>
                    <pdx-rating data-test="rating-md" label="Medium rating" value="3" count="5"></pdx-rating>
                    <pdx-rating data-test="rating-lg" label="Large rating" value="3" count="5" size="lg"></pdx-rating>
                </div>`,
        },
        {
            id: 'rating-disabled',
            title: 'Rating — Disabled',
            html: `<pdx-rating data-test="rating" label="Disabled rating" value="3" count="5" disabled></pdx-rating>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from rating.css) ──
    contracts: {
        scenarios: {
            'rating-basic': {
                standalone: [
                    {
                        // .pdx-rating → display: inline-flex (the inner div, not the host).
                        selector: 'section:not([hidden]) [data-test="rating"] .pdx-rating',
                        description: 'rating is inline-flex',
                        display: { op: 'oneOf', value: ['inline-flex', 'flex'] },
                    },
                    {
                        // An atom with 1.25rem icons → a cautious minimum.
                        selector: 'section:not([hidden]) [data-test="rating"] .pdx-rating',
                        description: 'rating height >= 14px',
                        height: { op: '>=', value: 14 },
                    },
                    {
                        // .pdx-rating → cursor: pointer (interactive).
                        selector: 'section:not([hidden]) [data-test="rating"] .pdx-rating',
                        description: 'rating cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // Not disabled → opaque.
                        selector: 'section:not([hidden]) [data-test="rating"] .pdx-rating',
                        description: 'rating opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        // count="5" → exactly 5 stars, each contained in the component.
                        description: 'star contained in rating (height <= rating height)',
                        parent: 'body',
                        children: {
                            rating: '[data-test="rating"] .pdx-rating',
                            star: '[data-test="rating"] .pdx-rating-star',
                        },
                        relations: [
                            {
                                description: 'star height <= rating height',
                                left: 'star.height',
                                op: '<=',
                                right: 'rating.height',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            'rating-sizes': {
                composition: [
                    {
                        // The icons scale sm 1rem < md 1.25rem < lg 1.75rem → the component's height
                        // follows (a star inherits the icon's size).
                        description: 'size hierarchy: sm < md < lg heights',
                        parent: 'body',
                        children: {
                            sm: '[data-test="rating-sm"] .pdx-rating',
                            md: '[data-test="rating-md"] .pdx-rating',
                            lg: '[data-test="rating-lg"] .pdx-rating',
                        },
                        relations: [
                            { description: 'sm < md', left: 'sm.height', op: '<', right: 'md.height' },
                            { description: 'md < lg', left: 'md.height', op: '<', right: 'lg.height' },
                        ],
                    },
                ],
            },
            'rating-disabled': {
                // A state already in the markup → standalone (no StateRule: the reactive
                // .pdx-rating-disabled class would flake with trigger:'attribute'). We measure the final state.
                standalone: [
                    {
                        // .pdx-rating-disabled → opacity: var(--pdx-opacity-disabled) (< 1).
                        selector: 'section:not([hidden]) [data-test="rating"] .pdx-rating',
                        description: 'disabled rating has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="slider" + aria-valuenow/min/max + aria-label (the label prop). No disableRules.
    a11y: {
        scenarios: ['rating-basic', 'rating-disabled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'rating-basic',
        targets: [
            // An atom with SVG icons: a generous tolerance for a pathological host.
            { selector: 'section:not([hidden]) [data-test="rating"] .pdx-rating', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA slider) ──
    // role="slider": a single focusable element (tabindex=0), NOT roving over the stars.
    // Tab lands on the div; the arrows and Home/End change the value (an async emit) but the focus
    // stays on the element → expectFocusWithin on the component (robust to the prop's timing).
    keyboard: {
        scenario: 'rating-basic',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="rating"] .pdx-rating' },
            { key: 'ArrowRight', expectFocusWithin: '[data-test="rating"]' },
            { key: 'ArrowLeft', expectFocusWithin: '[data-test="rating"]' },
            { key: 'Home', expectFocusWithin: '[data-test="rating"]' },
            { key: 'End', expectFocusWithin: '[data-test="rating"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['rating-basic'],
    },
};

export default rating;
