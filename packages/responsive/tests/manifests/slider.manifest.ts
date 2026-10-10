/**
 * MANIFEST — pdx-slider
 *
 * Contracts WRITTEN by inspecting the source (packages/ui/src/slider/pdx-slider.ts)
 * and the CSS (packages/design/src/surfaces/slider.css). The slider is a custom component
 * (NOT an <input type=range>): a track plus a fill plus a thumb, with role="slider" on the thumb.
 *
 * The strategy (lessons from wave 2): only assertions true on all 13 themes. No exact px
 * on anything value-driven (the fill's width depends on the value → a composition
 * rule). Selectors always scoped to section:not([hidden]).
 *
 * The base geometry (slider.css, independent of the theme):
 *  - .pdx-slider          height 2rem (32px), display:flex, cursor:pointer
 *  - .pdx-slider-track    width 100% (grande), height 0.375rem (6px), radius full
 *  - .pdx-slider-thumb    1.25rem (20px) quadrato, role="slider", tabindex=0
 *  - aria-valuemin/valuemax/valuenow plus aria-orientation on the thumb
 *
 * Keyboard (the CSS plays no part; it is onKeydown in the setup): step=1, value=40.
 *  The thumb answers ArrowRight/Left/Up/Down (±step), Home (min), End (max),
 *  PageUp/Down (±step*10). The step is predictable → expectAttr on aria-valuenow.
 *  On top of that we check that the fill changes geometry (expectGeometryChange).
 */
import type { ComponentManifest } from './_types';

export const slider: ComponentManifest = {
    name: 'slider',
    tag: 'pdx-slider',
    tier: '1C',
    status: 'wip',
    imports: ['@pdxui/ui/slider'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'slider-basic',
            title: 'Slider — Basic',
            // value=40, step=1 → a predictable keyboard. An aria-label, to be fair to a11y.
            html: `
                <div style="max-width: 400px; padding: 16px;">
                    <pdx-slider data-test="slider" value="40" min="0" max="100" step="1"
                        aria-label="Volume"></pdx-slider>
                </div>`,
        },
        {
            id: 'slider-sizes',
            title: 'Slider — Sizes',
            html: `
                <div style="display:flex; flex-direction:column; gap:24px; max-width:400px; padding:16px;">
                    <pdx-slider data-test="slider-sm" size="sm" value="40" aria-label="Small"></pdx-slider>
                    <pdx-slider data-test="slider-md" value="40" aria-label="Medium"></pdx-slider>
                    <pdx-slider data-test="slider-lg" size="lg" value="40" aria-label="Large"></pdx-slider>
                </div>`,
        },
        {
            id: 'slider-disabled',
            title: 'Slider — Disabled',
            html: `
                <div style="max-width: 400px; padding: 16px;">
                    <pdx-slider data-test="slider" value="40" disabled aria-label="Disabled"></pdx-slider>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'slider-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-track',
                        description: 'slider track is wide (spans the control)',
                        width: { op: '>=', value: 100 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-track',
                        description: 'slider track has a height (thin rail)',
                        height: { op: '>=', value: 2 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-track',
                        description: 'slider track radius >= 0',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-thumb',
                        description: 'slider thumb has a usable width',
                        width: { op: '>=', value: 10 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-thumb',
                        description: 'slider thumb has a usable height',
                        height: { op: '>=', value: 10 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-thumb',
                        description: 'slider thumb radius >= 0',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // The inner .pdx-slider has cursor:pointer (the custom element host is 'auto').
                        selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider',
                        description: 'slider inner cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        // The fill is value-driven (width = the percentage). NOT an exact px:
                        // all we check is that it is contained in the track (a geometric relation).
                        description: 'fill is no wider than the track',
                        parent: 'section:not([hidden]) [data-test="slider"]',
                        children: {
                            track: 'section:not([hidden]) [data-test="slider"] .pdx-slider-track',
                            fill: 'section:not([hidden]) [data-test="slider"] .pdx-slider-fill',
                        },
                        relations: [
                            {
                                description: 'fill.width <= track.width',
                                left: 'fill.width',
                                op: '<=',
                                right: 'track.width',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            'slider-disabled': {
                states: [
                    {
                        description: 'disabled slider has reduced opacity',
                        selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider',
                        trigger: 'attribute',
                        attribute: { name: 'disabled', value: '' },
                        changes: { opacity: { op: '<', value: 1 } },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // The thumb carries role="slider" + aria-valuemin/max/now; the scenario gives it an aria-label
    // on the host → a fair test (no false positives from a missing label).
    a11y: {
        scenarios: ['slider-basic', 'slider-disabled'],
    },

    // ── Dim. 3: style isolation ──
    // The track must keep its geometry (a large width, a thin height) even
    // under hostile global CSS. A 10px tolerance, as the tier's target requires.
    isolation: {
        scenario: 'slider-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-track', tolerancePx: 10, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopWidth', 'borderTopStyle', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA slider) ──
    // Pattern 'none' with explicit steps: the slider is neither roving nor tabs. value=40, step=1.
    // 1) Tab puts the focus on the thumb (role=slider, tabindex=0).
    // 2) ArrowRight → aria-valuenow 41 (a predictable step) plus a change in the fill's geometry.
    // 3) ArrowLeft → back to 40.
// 4) Home → min (0). End → max (100). Deterministic values, from the source.
    keyboard: {
        scenario: 'slider-basic',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="slider"] .pdx-slider-thumb' },
            {
                key: 'ArrowRight',
                expectAttr: {
                    selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-thumb',
                    name: 'aria-valuenow',
                    value: '41',
                },
                expectGeometryChange: 'section:not([hidden]) [data-test="slider"] .pdx-slider-fill',
            },
            {
                key: 'ArrowLeft',
                expectAttr: {
                    selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-thumb',
                    name: 'aria-valuenow',
                    value: '40',
                },
            },
            {
                key: 'Home',
                expectAttr: {
                    selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-thumb',
                    name: 'aria-valuenow',
                    value: '0',
                },
            },
            {
                key: 'End',
                expectAttr: {
                    selector: 'section:not([hidden]) [data-test="slider"] .pdx-slider-thumb',
                    name: 'aria-valuenow',
                    value: '100',
                },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // The thumb has a box-shadow and transform transition → the runner's freeze is enough
    // (there is no continuous animation loop in the resting state).
    visual: {
        scenarios: ['slider-basic'],
    },
};

export default slider;
