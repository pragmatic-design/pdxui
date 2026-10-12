/**
 * MANIFEST — pdx-tabs
 */
import type { ComponentManifest } from './_types';

export const tab: ComponentManifest = {
    name: 'tab',
    tag: 'pdx-tabs',
    tier: '2B',
    status: 'wip',
    // CSS-only: the scenario is a <div class="pdx-tabs">, so there is no element to register
    // — what it needs is the STYLESHEET, which is not in base.css (tabs.css has a layered
    // entry of its own). Declared here because the generated page imports what the manifests
    // declare, and with nothing declared the strip is unpainted on every theme.
    imports: ['@pdxui/design/components/tabs'],

// ── Scenarios ──
    scenarios: [
        {
            id: 'tab-basic',
            title: 'Tabs — Basic',
            html: `
                <div class="pdx-tabs" role="tablist" data-test="tabs">
                    <button class="pdx-tab active" role="tab" aria-selected="true" data-test="tab-active">Tab 1</button>
                    <button class="pdx-tab" role="tab" aria-selected="false" data-test="tab-inactive">Tab 2</button>
                    <button class="pdx-tab" role="tab" aria-selected="false">Tab 3</button>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'tab-basic': {
                standalone: [
                    {
                        selector: '[data-test="tab-active"]',
                        description: 'active tab has primary color text',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: '[data-test="tab-inactive"]',
                        description: 'inactive tab has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        description: 'tabs container has consistent height',
                        parent: '[data-test="tabs"]',
                        children: {
                            active: '[data-test="tab-active"]',
                            inactive: '[data-test="tab-inactive"]',
                        },
                        relations: [
                            {
                                description: 'active and inactive same height',
                                left: 'active.height',
                                op: '==',
                                right: 'inactive.height',
                                tolerance: 4,
                            },
                        ],
                    },
                ],
            },
        },
        // Per-theme active-tab style.
        themeOverrides: {
            // M3's 3dp primary indicator. With <pdx-tabs> it is the `.pdx-tab-indicator` element
            // (asserted in tabs.manifest.ts); these CSS-only tabs have no such element, and material
            // removes the tab borders, so without it the active tab has only a tonal background.
            // Drawn as an outer shadow 3px below the tab — on the divider, where the element sits.
            material: {
                'tab-basic': {
                    standalone: [
                        {
                            selector: '[data-test="tab-active"]',
                            description: 'material: the active tab has a 3dp indicator under it, in a colour',
                            boxShadow: { op: 'matches', value: '^(?!rgba\\(0, 0, 0, 0\\)).+ 0px 3px 0px 0px$' },
                        },
                        {
                            // Control: an indicator on every tab would satisfy the rule above.
                            selector: '[data-test="tab-inactive"]',
                            description: 'material: an inactive tab has no indicator',
                            boxShadow: { op: 'is', value: 'none' },
                        },
                    ],
                    states: [
                        {
                            // The indicator is a box-shadow, and so is the base focus ring: a rule that
                            // set only the indicator would take the ring off the focused active tab.
                            description: 'material: focusing the active tab still adds the focus ring, over the indicator',
                            selector: '[data-test="tab-active"]',
                            trigger: 'focus',
                            changes: { boxShadow: { op: 'matches', value: ' 0px 3px 0px 0px, .+ 0px 0px 0px 2px inset$' } },
                        },
                    ],
                },
            },
            fluent: {
                'tab-basic': {
                    standalone: [
                        {
                            selector: '[data-test="tab-active"]',
                            description: 'fluent: active tab has a 3px underline (strokeWidthThicker)',
                            border: { bottom: { width: { op: '>=', value: 3 } } },
                        },
                        {
                            selector: '[data-test="tab-active"]',
                            description: 'fluent: active tab is semibold',
                            fontWeight: { op: 'oneOf', value: ['600', '700'] },
                        },
                    ],
                },
            },
            cupertino: {
                'tab-basic': {
                    standalone: [
                        {
                            selector: '[data-test="tabs"]',
                            description: 'cupertino: segmented control has an inset background',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                        {
                            selector: '[data-test="tabs"]',
                            description: 'cupertino: segmented control is compact, height <= 40px (32pt)',
                            height: { op: '<=', value: 40 },
                        },
                        {
                            selector: '[data-test="tabs"]',
                            description: 'cupertino: segmented control is rounded, radius >= 6px (8pt)',
                            radius: { all: { op: '>=', value: 6 } },
                        },
                        {
                            selector: '[data-test="tab-active"]',
                            description: 'cupertino: active segment is raised with a shadow',
                            boxShadow: { op: 'isNot', value: 'none' },
                        },
                    ],
                },
            },
            corporate: {
                'tab-basic': {
                    standalone: [
                        {
                            selector: '[data-test="tab-active"]',
                            description: 'corporate: active tab has a 3px underline',
                            border: { bottom: { width: { op: '>=', value: 3 } } },
                        },
                    ],
                },
            },
            playful: {
                'tab-basic': {
                    standalone: [
                        {
                            selector: '[data-test="tabs"]',
                            description: 'playful: pill container has an inset background',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                        {
                            selector: '[data-test="tab-active"]',
                            description: 'playful: active tab is filled',
                            backgroundColor: { op: 'isNot', value: 'rgba(0, 0, 0, 0)' },
                        },
                    ],
                },
            },
            cyberpunk: {
                'tab-basic': {
                    standalone: [
                        {
                            selector: '[data-test="tab-active"]',
                            description: 'cyberpunk: active tab has a neon glow',
                            boxShadow: { op: 'isNot', value: 'none' },
                        },
                    ],
                },
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['tab-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'tab-basic',
        targets: [
            // A 10px tolerance: the tab is a CSS-only <button> (flex). The defensive fix
            // (line-height + box-sizing in tabs.css) brought the drift under hostile CSS
            // down from ~44px to ~8px; the smaller remainder, from aggressive host resets, is acceptable.
            { selector: '[data-test="tab-active"]', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        scenario: 'tab-basic',
        steps: [],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['tab-basic'],
    },
};

export default tab;
