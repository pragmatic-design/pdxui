/**
 * MANIFEST — pdx-sparkline
 *
 * Contracts DERIVED by inspecting the source:
 *   - Source: packages/ui/src/chart/pdx-sparkline.ts
 *       · render(): one <canvas data-part="canvas" style="display:block;max-width:100%">.
 *       · In a frame the setup sizes the canvas from the `width` and `height` props (120px × 32px by
 *         default) and draws: a line with a faint area, an area, or bars. No axes, tooltip or legend.
 *       · `max-width:100%`: `width` is a size to draw at, not to overflow at — in a narrower box the
 *         canvas shrinks to it.
 *       · The host is an image (`role="img"`) named by its data, or by `label` (declared on the host).
 *
 * THE RENDER TYPE: 2D CANVAS. As for pdx-chart (chart.manifest.ts), the pixels depend on the device
 * pixel ratio and on the platform's antialiasing, so there is NO visual regression: the maths measures
 * the canvas's BOX, which is deterministic.
 *
 * No keyboard dimension: a sparkline is an image, not a control, and is not a tab stop.
 *
 * Selectors ALWAYS scoped `section:not([hidden]) ...`.
 */
import type { ComponentManifest } from './_types';

export const sparkline: ComponentManifest = {
    name: 'sparkline',
    tag: 'pdx-sparkline',
    tier: '7',
    status: 'wip',
    imports: ['@pdxui/ui/sparkline'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'sparkline-line',
            title: 'Sparkline — line, default size (120×32)',
            html: `
                <div style="width:400px">
                    <pdx-sparkline data-test="spark" data="4,8,6,12,9,14"></pdx-sparkline>
                </div>`,
        },
        {
            // A box narrower than `width`: the canvas shrinks to it instead of running past it.
            id: 'sparkline-narrow',
            title: 'Sparkline — in a 60px box, narrower than its width',
            html: `
                <div data-test="box" style="width:60px">
                    <pdx-sparkline data-test="spark-narrow" type="bar" data="4,8,6,12,9,14"></pdx-sparkline>
                </div>`,
        },
        {
            id: 'sparkline-labelled',
            title: 'Sparkline — area, named by its label',
            html: `
                <div style="width:400px">
                    <pdx-sparkline data-test="spark-area" type="area" label="Revenue, rising" data="1,3,2,5"></pdx-sparkline>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, all 13 themes) ──
    // The canvas's BOX, never its pixels.
    contracts: {
        scenarios: {
            'sparkline-line': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="spark"] [data-part="canvas"]',
                        description: 'the canvas takes its default width, 120px',
                        width: { op: '>=', value: 119 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="spark"] [data-part="canvas"]',
                        description: 'the canvas is no wider than its default width',
                        width: { op: '<=', value: 121 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="spark"] [data-part="canvas"]',
                        description: 'the canvas takes its default height, 32px',
                        height: { op: '>=', value: 31 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="spark"] [data-part="canvas"]',
                        description: 'the canvas is no taller than its default height',
                        height: { op: '<=', value: 33 },
                    },
                ],
            },
            'sparkline-narrow': {
                composition: [
                    {
                        description: 'in a box narrower than its width the canvas shrinks to the box',
                        parent: 'section:not([hidden]) [data-test="box"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="box"]',
                            canvas: 'section:not([hidden]) [data-test="spark-narrow"] [data-part="canvas"]',
                        },
                        relations: [
                            { description: 'canvas within its box', left: 'canvas', op: 'contained-in', right: 'box' },
                            { description: 'canvas no wider than its box', left: 'canvas.width', op: '<=', right: 'box.width', tolerance: 1 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    // The host is role="img" with an accessible name: axe's role-img-alt holds it, which a bare
    // canvas would fail silently.
    a11y: {
        scenarios: ['sparkline-line', 'sparkline-narrow', 'sparkline-labelled'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'sparkline-line',
        targets: [
            { selector: 'section:not([hidden]) [data-test="spark"] [data-part="canvas"]', tolerancePx: 2 },
        ],
    },

    // ── Dim. 5: visual regression — DELIBERATELY OMITTED, as for pdx-chart: a 2D canvas scaled by the
    // device pixel ratio and antialiased by the platform is not deterministic across operating systems.
};

export default sparkline;
