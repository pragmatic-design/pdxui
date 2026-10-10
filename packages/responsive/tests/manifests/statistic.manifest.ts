/**
 * MANIFEST — pdx-statistic
 *
 * Contracts written by inspecting the source (packages/ui/src/statistic/pdx-statistic.ts)
 * and the CSS (packages/design/src/components/statistic.css).
 *
 * DOM structure (host vs inner):
 *   - The ROOT class is on the HOST <pdx-statistic> itself: `el.className = 'pdx-statistic-root'`
 *     (plus 'pdx-statistic-sm'/'-lg' for the size). The host's CSS: `display: block`; the root: `display: flex`,
 *     flex-direction column, gap. → the host's effective display = flex.
 *   - Children (inner), built imperatively in an rAF:
 *       · <pdx-icon class="pdx-statistic-icon">          (when icon)
 *       · <div class="pdx-statistic-title">              (label, when title)
 *       · <div class="pdx-statistic-value-wrap">         (always)
 *             <span class="pdx-statistic-prefix">        (when prefix)
 *             <span class="pdx-statistic-value">         (always — the KPI)
 *             <span class="pdx-statistic-suffix">        (when suffix)
 *       · <div class="pdx-statistic-trend [-up|-down|-flat]"> (when trend or trendValue)
 *             <pdx-icon name="trending-up|down|minus" size=14>  ← NO aria-label and no text
 *             <span>trendValue</span>                            ← accessible text (when trendValue)
 *       · <div class="pdx-statistic-desc"> / <div class="pdx-statistic-compare">
 *
 * A CONTENT-DRIVEN container: its height is the sum of the children (title + value + trend), with no
 * intrinsic height → isolation with skipHeight:true (it asserts the radius alone, which is not scaled).
 * The root has no border and no border-radius in the CSS → radius >= 0 (0 by default, conservative).
 *
 * NOT interactive (pure display) → the keyboard block is OMITTED.
 *
 * A POTENTIAL a11y BUG (reported): the trend icon (`pdx-icon` trending-up/down) is
 * the ONLY direction indicator when trendValue is absent, but it has no aria-label and no
 * text → a screen reader does not announce "up/down". The a11y scenario ALWAYS uses a
 * text trendValue ("+12.5%", say) to stay accessible; if the component is to
 * support an icon-only trend, the icon must be labelled (aria-label).
 */
import type { ComponentManifest } from './_types';

export const statistic: ComponentManifest = {
    name: 'statistic',
    tag: 'pdx-statistic',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/statistic'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'statistic-basic',
            title: 'Statistic — KPI with title, value, trend',
            // A text trend-value ("+12.5%") → the trend is accessible through text, not the icon alone.
            html: `
                <div style="max-width: 320px;">
                    <pdx-statistic
                        data-test="stat"
                        title="Monthly revenue"
                        value="48295"
                        prefix="$"
                        precision="0"
                        trend="up"
                        trend-value="+12.5%"></pdx-statistic>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'statistic-basic': {
                standalone: [
                    {
                        // The root class is on the HOST.
                        selector: 'section:not([hidden]) [data-test="stat"]',
                        description: 'statistic root is a flex (column) box',
                        display: { op: 'oneOf', value: ['flex', 'block'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="stat"]',
                        description: 'statistic root has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="stat"]',
                        description: 'statistic is tall enough to hold title + value + trend',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="stat"] .pdx-statistic-value',
                        description: 'KPI value is rendered (visible box)',
                        height: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        // The title, the value and the trend are contained in the root's box (a vertical stack).
                        description: 'title, value and trend are contained within the statistic box',
                        parent: 'section:not([hidden]) [data-test="stat"]',
                        children: {
                            root: 'section:not([hidden]) [data-test="stat"]',
                            title: 'section:not([hidden]) [data-test="stat"] .pdx-statistic-title',
                            value: 'section:not([hidden]) [data-test="stat"] .pdx-statistic-value',
                            trend: 'section:not([hidden]) [data-test="stat"] .pdx-statistic-trend',
                        },
                        relations: [
                            { description: 'title within root', left: 'title', op: 'contained-in', right: 'root' },
                            { description: 'value within root', left: 'value', op: 'contained-in', right: 'root' },
                            { description: 'trend within root', left: 'trend', op: 'contained-in', right: 'root' },
                            // A vertical stack: title above value, value above trend.
                            { description: 'title above value', left: 'title.bottom', op: '<=', right: 'value.top', tolerance: 2 },
                            { description: 'value above trend', left: 'value.bottom', op: '<=', right: 'trend.top', tolerance: 2 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // The main scenario: text for the title, the value and the trend (a text trend-value → accessible).
        scenarios: ['statistic-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'statistic-basic',
        targets: [
            // A content-driven container: skip the height (= the content), assert the radius. A container tolerance.
            { selector: 'section:not([hidden]) [data-test="stat"]', tolerancePx: 12, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard — N/A: a display-only component, not interactive. ──

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['statistic-basic'],
    },
};

export default statistic;
