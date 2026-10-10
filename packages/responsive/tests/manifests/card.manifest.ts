/**
 * MANIFEST — pdx-card
 *
 * Contracts written by inspecting the source (packages/ui/src/card/pdx-card.ts) and the CSS
 * (packages/design/src/surfaces/base.css, the .pdx-surface-card / .pdx-card-* block).
 *
 * DOM structure: the custom element <pdx-card> renders an inner <div class="pdx-surface pdx-surface-card ...">.
 * The visual classes (.pdx-card-clickable, -selected, -hoverable, -disabled) are on the inner div.
 * The role and tabindex (clickable/href) are set on the HOST <pdx-card> (ctx.el) in ctx.track().
 *
 * Geometria base (.pdx-surface-card): border (border-width solid), border-radius lg,
 * padding lg, box-shadow sm. Conservativi cross-tema: radius >= 0 (metro/cyberpunk azzerano),
 * border width >= 0, no exact px.
 */
import type { ComponentManifest } from './_types';

export const card: ComponentManifest = {
    name: 'card',
    tag: 'pdx-card',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/card'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'card-basic',
            title: 'Card — Basic (sectioned)',
            html: `
                <div style="max-width: 480px;">
                    <pdx-card data-test="card">
                        <div class="pdx-card-header" data-test="card-header">Card title</div>
                        <div class="pdx-card-body" data-test="card-body">
                            Some descriptive body content for the card that spans a couple of lines.
                        </div>
                    </pdx-card>
                </div>`,
        },
        {
            id: 'card-clickable',
            title: 'Card — Clickable',
            html: `
                <div style="max-width: 480px;">
                    <pdx-card data-test="card-clickable" clickable>
                        <div class="pdx-card-body">Clickable card</div>
                    </pdx-card>
                </div>`,
        },
        {
            id: 'card-selected',
            title: 'Card — Selected',
            html: `
                <div style="max-width: 480px;">
                    <pdx-card data-test="card-unselected">
                        <div class="pdx-card-body">Unselected</div>
                    </pdx-card>
                    <pdx-card data-test="card-selected" clickable selected>
                        <div class="pdx-card-body">Selected</div>
                    </pdx-card>
                </div>`,
        },
        {
            id: 'card-disabled',
            title: 'Card — Disabled',
            html: `
                <div style="max-width: 480px;">
                    <pdx-card data-test="card-disabled" clickable disabled>
                        <div class="pdx-card-body">Disabled card</div>
                    </pdx-card>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'card-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                        description: 'card container is a block-ish box (display set)',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                        description: 'card container is tall enough to hold sectioned content',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                        description: 'card has non-negative border radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                        description: 'card border width is non-negative',
                        border: { all: { width: { op: '>=', value: 0 } } },
                    },
                ],
                // Composition: the header and the body sit INSIDE the card (horizontal containment plus the box).
                composition: [
                    {
                        description: 'card sections are contained within the card box',
                        parent: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                        children: {
                            card: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            header: 'section:not([hidden]) [data-test="card-header"]',
                            body: 'section:not([hidden]) [data-test="card-body"]',
                        },
                        relations: [
                            {
                                description: 'header within card box',
                                left: 'header',
                                op: 'contained-in',
                                right: 'card',
                            },
                            {
                                description: 'body within card box',
                                left: 'body',
                                op: 'contained-in',
                                right: 'card',
                            },
                            {
                                description: 'header right edge does not overflow card right edge',
                                left: 'header.right',
                                op: '<=',
                                right: 'card.right',
                                tolerance: 1,
                            },
                            {
                                description: 'body right edge does not overflow card right edge',
                                left: 'body.right',
                                op: '<=',
                                right: 'card.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'card-clickable': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="card-clickable"] .pdx-surface-card',
                        description: 'clickable card has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
            },
            'card-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="card-disabled"] .pdx-surface-card',
                        description: 'disabled card has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="card-disabled"] .pdx-surface-card',
                        description: 'disabled card disables pointer events',
                        pointerEvents: { op: 'is', value: 'none' },
                    },
                ],
            },
        },
        // Per-theme card style.
        themeOverrides: {
            material: {
                'card-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'material: elevated card has a shadow (level 1)',
                            boxShadow: { op: 'isNot', value: 'none' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'material: corner-medium, radius >= 12px',
                            radius: { all: { op: '>=', value: 12 } },
                        },
                    ],
                },
            },
            fluent: {
                'card-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'fluent: visible border',
                            border: { all: { style: { op: 'is', value: 'solid' }, width: { op: '>=', value: 1 } } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'fluent: subtle shadow',
                            boxShadow: { op: 'isNot', value: 'none' },
                        },
                    ],
                },
            },
            corporate: {
                'card-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'corporate: flat, no shadow',
                            boxShadow: { op: 'is', value: 'none' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'corporate: sharp radius <= 6px',
                            radius: { all: { op: '<=', value: 6 } },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'corporate: visible solid border',
                            border: { all: { style: { op: 'is', value: 'solid' } } },
                        },
                    ],
                },
            },
            playful: {
                'card-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'playful: has a shadow',
                            boxShadow: { op: 'isNot', value: 'none' },
                        },
                    ],
                },
            },
            editorial: {
                'card-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'editorial: no shadow',
                            boxShadow: { op: 'is', value: 'none' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card',
                            description: 'editorial: zero radius',
                            radius: { all: { op: '==', value: 0, tolerance: 1 } },
                        },
                    ],
                },
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // The clickable card is the main interactive scenario: the host gets role="button" and a tabindex.
        scenarios: ['card-clickable'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'card-basic',
        targets: [
            // A content-driven container: the hostile CSS poisons the font and line-height → the text inside
            // reflows and the height follows (which is legitimate, not a containment failure). The height drift
            // is stronger on Linux/Docker (~19px) than on Windows. Skip the height; the radius and the border stay
            // asserted as the real immunity guarantee (as for dialog and alert-dialog).
            { selector: 'section:not([hidden]) [data-test="card"] .pdx-surface-card', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // A clickable card is focusable (the host has tabindex=0 and role=button) and is pressed with Enter and
        // Space: the listener is on the host, since a key on the host never reaches a listener on the inner div.
        scenario: 'card-clickable',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="card-clickable"]' },
            { key: 'Enter', expectEvent: { selector: 'section:not([hidden]) [data-test="card-clickable"]', name: 'pdx-click' } },
            { key: 'Space', expectEvent: { selector: 'section:not([hidden]) [data-test="card-clickable"]', name: 'pdx-click' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['card-basic'],
    },
};

export default card;
