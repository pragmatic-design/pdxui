/**
 * MANIFEST — pdx-banner
 *
 * Contracts written by inspecting the source (packages/ui/src/banner/pdx-banner.ts) and the CSS
 * (packages/design/src/components/banner.css, the .pdx-banner / .pdx-banner-* block).
 *
 * DOM structure: the custom element <pdx-banner> renders an inner
 *   <div class="pdx-banner pdx-banner-{type}" role="alert|status">
 *     <pdx-icon class="pdx-banner-icon"> (when showIcon)
 *     <span class="pdx-banner-text"><slot></span>
 *     <button class="pdx-banner-close" aria-label="Close"> (when closable)
 *   </div>
 * The classes and the role are on the inner div. role = 'alert' for danger and error, 'status'
 * otherwise (the variant prop defaults to 'info'; the source uses 'variant', not 'type').
 *
 * Geometria base (.pdx-banner): display:flex, padding 0.5rem 1rem, width:100%, gap 0.5rem.
 * No border except on .pdx-banner-subtle (a border-bottom). Conservative across themes:
 * display flex, height >= a minimum threshold (padding plus font), no exact px.
 */
import type { ComponentManifest } from './_types';

export const banner: ComponentManifest = {
    name: 'banner',
    tag: 'pdx-banner',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/banner'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'banner-variants',
            title: 'Banner — Variants (info/success/warning/danger)',
            html: `
                <div style="max-width: 640px;">
                    <pdx-banner data-test="banner-info" variant="info">Info message.</pdx-banner>
                    <pdx-banner data-test="banner-success" variant="success">Success message.</pdx-banner>
                    <pdx-banner data-test="banner-warning" variant="warning">Warning message.</pdx-banner>
                    <pdx-banner data-test="banner-danger" variant="danger">Danger message.</pdx-banner>
                </div>`,
        },
        {
            id: 'banner-closable',
            title: 'Banner — Closable',
            html: `
                <div style="max-width: 640px;">
                    <pdx-banner data-test="banner-closable" variant="info" closable>Dismissable message.</pdx-banner>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'banner-variants': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="banner-info"] .pdx-banner',
                        description: 'banner is a flex row',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="banner-info"] .pdx-banner',
                        description: 'banner has padding-driven minimum height',
                        height: { op: '>=', value: 24 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="banner-danger"] .pdx-banner',
                        description: 'danger banner is a flex row',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="banner-danger"] .pdx-banner',
                        description: 'danger banner has padding-driven minimum height',
                        height: { op: '>=', value: 24 },
                    },
                    // The label on each fill: success and danger wear a label the theme gate does not
                    // check (gray-950 in dark, primary's label on danger).
                    ...['info', 'success', 'warning', 'danger'].map((v) => ({
                        selector: `section:not([hidden]) [data-test="banner-${v}"] .pdx-banner`,
                        description: `${v} banner text is legible (AA)`,
                        contrast: { op: '>=' as const, value: 4.5 },
                    })),
                ],
                // Composition: the icon and the text sit INSIDE the banner's box.
                composition: [
                    {
                        description: 'banner parts are contained within the banner box',
                        parent: 'section:not([hidden]) [data-test="banner-info"] .pdx-banner',
                        children: {
                            banner: 'section:not([hidden]) [data-test="banner-info"] .pdx-banner',
                            text: 'section:not([hidden]) [data-test="banner-info"] .pdx-banner-text',
                        },
                        relations: [
                            {
                                description: 'text within banner box',
                                left: 'text',
                                op: 'contained-in',
                                right: 'banner',
                            },
                            {
                                description: 'text right edge does not overflow banner right edge',
                                left: 'text.right',
                                op: '<=',
                                right: 'banner.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'banner-closable': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="banner-closable"] .pdx-banner-close',
                        description: 'close button has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // Closable: the main scenario. The close button has aria-label="Close" in the source
        // (render: <button class="pdx-banner-close" aria-label="Close">×</button>) → accessible name OK.
        scenarios: ['banner-closable'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'banner-variants',
        targets: [
            // Defences for box-sizing+line-height+border in banner.css; a ~11px residue from a
            // pathological host (`div{line-height:2.2}`) on a flex container. Tolerance 14.
            { selector: 'section:not([hidden]) [data-test="banner-info"] .pdx-banner', tolerancePx: 14, leaks: [{ issue: 170, properties: ['fontFamily', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // Closable: the only interactive element is the close button → Tab focuses it.
        scenario: 'banner-closable',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="banner-closable"] .pdx-banner-close' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['banner-variants'],
    },
};

export default banner;
