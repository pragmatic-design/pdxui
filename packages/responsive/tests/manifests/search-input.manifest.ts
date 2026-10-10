/**
 * MANIFEST — pdx-search-input
 *
 * A specialised input (the same wrapper pattern as pdx-input): the host renders
 * a `.pdx-input-wrap` with a `.pdx-input-prefix` (the search or loading icon) plus
 * an inner `input.pdx-input[type=search][role=searchbox]` and a conditional clear button
 * (`.pdx-input-clear.pdx-input-suffix-interactive`, visible only
 * when there is a value).
 *
 * Conservative contracts: true on all 13 themes. No exact px.
 */
import type { ComponentManifest } from './_types';

export const searchInput: ComponentManifest = {
    name: 'search-input',
    tag: 'pdx-search-input',
    tier: '1C',
    status: 'wip',
    imports: ['@pdxui/ui/search-input'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'search-input-basic',
            title: 'Search Input — Basic',
            // An aria-label on the host: on its own it needs an accessible name (axe's "label" rule).
            // Note: the component exposes no ariaLabel prop and does not forward it to the <input>
            //     inside → see the report (a possible a11y bug). type=search + role=searchbox
            //     give it a correct role anyway.
            html: `<pdx-search-input data-test="search" placeholder="Search..." aria-label="Search"></pdx-search-input>`,
        },
        {
            id: 'search-input-value',
            title: 'Search Input — With value (clear visible)',
            // With a value set → the clear button is rendered.
            html: `<pdx-search-input data-test="search" value="hello" aria-label="Search"></pdx-search-input>`,
        },
        {
            id: 'search-input-disabled',
            title: 'Search Input — Disabled',
            html: `<pdx-search-input data-test="search" disabled placeholder="Search..." aria-label="Search"></pdx-search-input>`,
        },
        {
            id: 'search-input-sizes',
            title: 'Search Input — Sizes',
            html: `
                <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
                    <pdx-search-input data-test="search-sm" size="sm" aria-label="Small"></pdx-search-input>
                    <pdx-search-input data-test="search-md" aria-label="Medium"></pdx-search-input>
                    <pdx-search-input data-test="search-lg" size="lg" aria-label="Large"></pdx-search-input>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (rules scoped to their scenario) ──
    contracts: {
        scenarios: {
            'search-input-basic': {
                standalone: [
                    {
                        // Aligned with the input/button minimum (>=28): the dense themes stay valid.
                        selector: 'section:not([hidden]) [data-test="search"] .pdx-input-wrap',
                        description: 'input wrapper height >= 28px',
                        height: { op: '>=', value: 28 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="search"] .pdx-input-wrap',
                        description: 'wrapper radius >= 0 (mai negativo)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="search"] input.pdx-input',
                        description: 'inner input has no visible own border',
                        border: {
                            top: { style: { op: 'is', value: 'none' } },
                            left: { style: { op: 'is', value: 'none' } },
                            right: { style: { op: 'is', value: 'none' } },
                        },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="search"] .pdx-input-prefix',
                        description: 'search prefix is non-interactive (decorative icon)',
                        pointerEvents: { op: 'is', value: 'none' },
                    },
                ],
                composition: [
                    {
                        description: 'search prefix contained at the start of the wrapper',
                        parent: '[data-test="search"] .pdx-input-wrap',
                        children: {
                            prefix: '[data-test="search"] .pdx-input-prefix',
                        },
                        relations: [
                            { description: 'prefix left >= wrapper left', left: 'prefix.left', op: '>=', right: 'parent.left', tolerance: 1 },
                        ],
                    },
                ],
            },
            'search-input-value': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="search"] .pdx-input-clear',
                        description: 'clear button is a pointer affordance',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                // Note: no containment composition for the clear button — measuring its
                // position proved unreliable (a conditional clear, and the layout's timing).
                // The clear's affordance (cursor:pointer) is covered by the standalone rule above.
            },
            'search-input-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="search"] .pdx-input-wrap',
                        description: 'disabled wrapper is dimmed (opacity < 1)',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
            'search-input-sizes': {
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg heights',
                        parent: 'body',
                        children: {
                            sm: '[data-test="search-sm"] .pdx-input-wrap',
                            md: '[data-test="search-md"] .pdx-input-wrap',
                            lg: '[data-test="search-lg"] .pdx-input-wrap',
                        },
                        relations: [
                            { description: 'sm < md', left: 'sm.height', op: '<', right: 'md.height' },
                            { description: 'md < lg', left: 'md.height', op: '<', right: 'lg.height' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['search-input-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'search-input-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="search"] .pdx-input-wrap', tolerancePx: 10, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }, { issue: 170, properties: ['borderTopColor'], themes: ['material'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'search-input-basic',
        steps: [
            // Tab lands INSIDE the component (the clear has tabindex=-1): what is checked is the containment.
            { key: 'Tab', expectFocusWithin: '[data-test="search"] .pdx-input-wrap' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['search-input-basic'],
    },
};

export default searchInput;
