/**
 * MANIFEST — pdx-chart
 *
 * Contracts DERIVED by inspecting the source and the renderer:
 *   - Source: packages/ui/src/chart/pdx-chart.ts
 *       · render(): a single <div class="pdx-chart-canvas" style="width:100%;min-height:200px">.
 *       · In requestAnimationFrame the setup applies the height: when the `height` prop is set →
 *         canvasHost.style.height = height; OTHERWISE canvasHost.style.aspectRatio = '16 / 9'
 *         (pdx-chart.ts:181-187). So the height is NOT an absolute invariant: it either follows the
 *         `height` prop, or is derived from the width through the aspect ratio.
 *       · There is NO `.pdx-chart` CSS class in the design system (grep `.pdx-chart` in
 *         packages/design/src → no match). The style is inline; the isolation rests on the inline
 *         style (width 100%, min-height 200px) plus the aspect ratio, not on the design system's CSS. Which is why
 *         there are no theme-specific geometry overrides: the rules stay universal.
 *   - Renderer: packages/ui/src/chart/core/renderer.ts
 *       · CanvasRenderer creates a <canvas> (display:block, width:100%, height:100%) and APPENDS it
 *         inside `.pdx-chart-canvas`. It is the only drawing node: NO SVG. Everything is 2D canvas.
 *       · resize() uses window.devicePixelRatio to size the bitmap (HiDPI).
 *
 * THE RENDER TYPE: 2D CANVAS (not SVG). What that means for determinism:
 *   1. The ENTRANCE ANIMATION: engine.ts:307-319 animates animProgress from 0 to 1 over 400ms (an ease-out
 *      cubic) on every update(). Which frame is captured depends on the timing.
 *   2. HiDPI: the bitmap is scaled by devicePixelRatio → the pixels differ with the density
 *      of the screen and the OS.
 *   3. The canvas's antialiasing (axis text, lines, fills) is NOT deterministic across platforms.
 *   ⇒ THE DECISION: the VISUAL regression is OMITTED (see the `visual` block at the end). A pixel
 *      comparison of the canvas would fail across operating systems even with fixed data and the animation
 *      finished. The maths covers what matters here: the chart's BOX (the container and the canvas, sized),
 *      not the pixels inside it.
 *
 * THE SCENARIO'S DETERMINISM (for contract, axe and isolation, which measure the box, not the pixels):
 *   - FIXED inline data (3 values) through the `data` JSON attribute, with explicit `x-field`/`y-field`.
 *   - A wrapper of a known size, 400×300px → the chart's width is 100% of 400 = deterministic.
 *     The height comes from the inline aspect-ratio 16/9 on `.pdx-chart-canvas` (there is no `height`
 *     prop) → derived from the width: height ≈ width * 9/16. The contract checks the RELATION and
 *     that the sizes are > 0, not exact px.
 *   - `tooltip="false"`, to avoid floating tooltip nodes that are not deterministic during the measurement.
 *   - The animation lasts 400ms: the contract and isolation runners wait for the settle (>400ms) before
 *     measuring the BOX; the box (the container and the canvas) is stable once the animation ends, and only the
 *     PIXELS inside move during it — and those are not measured.
 *
 * THE TEXT ALTERNATIVE (WCAG 1.1.1, Non-text Content):
 *   The renderer draws on a BARE <canvas>, which has no text of its own: a canvas chart with no
 *   accessible name is invisible to screen readers. The host is a figure described by a hidden
 *   data table, and with more than one series the legend is made of DOM buttons.
 *
 * Selectors ALWAYS scoped `section:not([hidden]) ...`.
 */
import type { ComponentManifest } from './_types';

export const chart: ComponentManifest = {
    name: 'chart',
    tag: 'pdx-chart',
    tier: '7',
    status: 'wip',
    imports: ['@pdxui/ui/chart'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'chart-bar',
            title: 'Chart — Bar (fixed data, 400×300 wrapper, no animation settle)',
            // A 400×300 wrapper → the chart's width is deterministic (100% of 400). FIXED inline data:
            // 3 categories and values. tooltip="false" keeps the floating, non-deterministic nodes away.
            // No `height` prop → the canvas host applies the 16/9 aspect ratio (the height is derived).
            html: `
                <div style="width:400px;height:300px">
                    <pdx-chart
                        data-test="chart"
                        type="bar"
                        x-field="month"
                        y-field="sales"
                        tooltip="false"
                        data='[{"month":"Jan","sales":30},{"month":"Feb","sales":50},{"month":"Mar","sales":40}]'>
                    </pdx-chart>
                </div>`,
        },
        {
            // Two series → the legend is made of DOM buttons (aria-pressed), and the host is a
            // focusable figure described by a hidden data table.
            id: 'chart-two-series',
            title: 'Chart — two series, legend as buttons',
            html: `
                <div style="width:400px;height:300px">
                    <pdx-chart
                        data-test="chart2"
                        type="bar"
                        x-field="quarter"
                        y-field="desktop,mobile"
                        series-names="Desktop,Mobile"
                        tooltip="false"
                        data='[{"quarter":"Q1","desktop":4500,"mobile":3200},{"quarter":"Q2","desktop":5200,"mobile":3800}]'>
                    </pdx-chart>
                </div>`,
        },
        {
            // ONE series, three categories. A legend that listed series and appeared only with more
            // than one would leave a doughnut without one, its slices named by nothing.
            id: 'chart-doughnut',
            title: 'Chart — doughnut, one series, a legend of its slices',
            html: `
                <div style="width:400px;height:300px">
                    <pdx-chart
                        data-test="doughnut"
                        type="doughnut"
                        x-field="status"
                        y-field="count"
                        tooltip="false"
                        data='[{"status":"Open","count":12},{"status":"Waiting","count":9},{"status":"Closed","count":15}]'>
                    </pdx-chart>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, all 13 themes) ──
    // What is measured is the BOX (the container and the canvas), NEVER the drawn pixels. No theme-specific px:
    // the sizes and the geometric relations are identical in every theme.
    contracts: {
        scenarios: {
            'chart-bar': {
                standalone: [
                    {
                        // The host <pdx-chart>: it must be a rendered box (not display:none, not inline).
                        selector: 'section:not([hidden]) [data-test="chart"]',
                        description: 'chart host renders as a box',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid', 'inline-block'] },
                    },
                    {
                        // 100% of the 400px wrapper (a wide tolerance: what matters is that it is sized).
                        selector: 'section:not([hidden]) [data-test="chart"]',
                        description: 'chart host fills its 400px wrapper width',
                        width: { op: '>=', value: 200 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="chart"]',
                        description: 'chart host has positive height (drawing area present)',
                        height: { op: '>', value: 0 },
                    },
                    {
                        // The inner canvas host has an inline min-height:200px → a guaranteed minimum area.
                        selector: 'section:not([hidden]) [data-test="chart"] .pdx-chart-canvas',
                        description: 'canvas host honors its inline min-height (>= 200px)',
                        height: { op: '>=', value: 200 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="chart"] .pdx-chart-canvas',
                        description: 'canvas host has positive width',
                        width: { op: '>', value: 0 },
                    },
                    {
                        // The drawing <canvas> exists and is sized (renderer.ts appends it
                        // with width and height at 100% of the canvas host).
                        selector: 'section:not([hidden]) [data-test="chart"] canvas',
                        description: 'drawing canvas is present and has positive width',
                        width: { op: '>', value: 0 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="chart"] canvas',
                        description: 'drawing canvas has positive height',
                        height: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        // Containment: the canvas host sits INSIDE the host, and the <canvas> inside the host.
                        description: 'canvas host and canvas are contained within the chart host',
                        parent: 'section:not([hidden]) [data-test="chart"]',
                        children: {
                            host: 'section:not([hidden]) [data-test="chart"]',
                            canvasHost: 'section:not([hidden]) [data-test="chart"] .pdx-chart-canvas',
                            canvas: 'section:not([hidden]) [data-test="chart"] canvas',
                        },
                        relations: [
                            { description: 'canvas host within chart host', left: 'canvasHost', op: 'contained-in', right: 'host' },
                            { description: 'canvas within chart host', left: 'canvas', op: 'contained-in', right: 'host' },
                            {
                                description: 'canvas-host right edge does not overflow host right edge',
                                left: 'canvasHost.right', op: '<=', right: 'host.right', tolerance: 1,
                            },
                            {
                                description: 'canvas-host width fits within host width',
                                left: 'canvasHost.width', op: '<=', right: 'host.width', tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'chart-doughnut': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="doughnut"] .pdx-chart-legend:not([hidden]) .pdx-chart-legend-item',
                        description: 'a doughnut with three categories shows a legend of three items, one per slice',
                        count: { op: '==', value: 3 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // The host is a figure (not an img: an img's children are presentational),
        // described by a data table; with two series the legend is made of buttons.
        scenarios: ['chart-bar', 'chart-two-series', 'chart-doughnut'],
        // Note: NO disableRules. ⚠️ axe-core has no base rule that reports a <canvas>
        // without an accessible name (the canvas's content is opaque to axe), so axe will pass
        // SILENTLY on this scenario. A canvas with no text alternative (WCAG 1.1.1, see the header)
        // canNOT be caught automatically by axe. The scenario stays scanned, to catch other violations
        // (contrast, structure).
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'chart-bar',
        targets: [
            // The height is NOT an absolute invariant: it comes from the inline 16/9 aspect ratio and the width
            // (aspect-driven, as in aspect-ratio.manifest). skipHeight → the invariant is the width and the box,
            // not a fixed height. No radius or border from the design system (the style is inline) → a wide tolerance.
            { selector: 'section:not([hidden]) [data-test="chart"] .pdx-chart-canvas', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopWidth', 'borderTopStyle', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Not mouse-only (hover→tooltip, a click on a legend drawn on the canvas): the host is
    // focusable (the arrows walk the points, announced by a live region — covered by the unit
    // test) and the legend is made of buttons: Tab reaches the chart, Tab the first button, Enter hides
    // the series (aria-pressed="false").
    keyboard: {
        scenario: 'chart-two-series',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="chart2"]' },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="chart2"] .pdx-chart-legend-item:nth-child(1)' },
            {
                key: 'Enter',
                expectAttr: { selector: 'section:not([hidden]) [data-test="chart2"] .pdx-chart-legend-item:nth-child(1)', name: 'aria-pressed', value: 'false' },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — DELIBERATELY OMITTED ──
    // Render CANVAS 2D + animazione 400ms + scaling devicePixelRatio (HiDPI) + antialiasing:
    // NOT deterministic across operating systems. A pixel screenshot of the canvas would fail on Docker/Linux vs
    // Windows even with fixed data and the animation finished. The maths (Dim. 1) covers the BOX, which is
    // what can be verified deterministically. No `visual` block → the visual runner
    // skips this component. (The alternative, rejected: masking the whole drawing area would make the
    // screenshot empty and worthless.)
};

export default chart;
