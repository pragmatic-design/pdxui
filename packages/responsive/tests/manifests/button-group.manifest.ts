/**
 * MANIFEST — pdx-button-group
 *
 * Contracts DERIVED by inspecting the source and the CSS (they are NOT in universal.ts):
 *   - Source: packages/ui/src/button-group/pdx-button-group.ts
 *       · the styled class is on the HOST <pdx-button-group>, set in ctx.track:
 *         `el.className = 'pdx-btn-group'` (or 'pdx-btn-group-vertical' when orientation=vertical).
 *       · render() = <slot></slot>: the <pdx-button> elements are projected as direct children of the host.
 *       · An action group (mode="none", the default): visual grouping only, role="group".
 *   - CSS: packages/design/src/surfaces/buttons.css
 *       · `.pdx-btn-group { display: inline-flex }` (host).
 *       · `.pdx-btn-group > pdx-button { display: contents }` → the REAL flex child is each
 *         <pdx-button>'s INNER <button>. The geometry (height, radius) must be measured
 *         on `pdx-button > button`, NOT on the child host.
 *       · Radius joined via custom prop `--_btn-r`:
 *         - every middle one: `--_btn-r: 0`
 *         - first: the outer left radius, right 0
 *         - last: the outer right radius, left 0
 *         (the real radius = var(--pdx-button-radius, --pdx-radius-md); the radius-zero themes → 0)
 *       · Border overlap: `margin-left: calc(-1 * border-width)` on all but the first (flush).
 *
 * The contracts are CONSERVATIVE but true on all 13 themes: NO exact px.
 *   - "the same height" and "flush/joined" are universal geometric invariants.
 *   - radius: the first has a left corner >= 0, the last a right corner >= 0; the MIDDLE ones have
 *     radius 0 (joined) — the CSS imposes that, whatever the theme.
 *   - "first.topLeft >= middle.topLeft" catches the joined shape without assuming an absolute px.
 */
import type { ComponentManifest } from './_types';

export const buttonGroup: ComponentManifest = {
    name: 'button-group',
    tag: 'pdx-button-group',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/button-group'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'button-group-basic',
            title: 'Button Group — 3 connected buttons',
            html: `
                <pdx-button-group data-test="bg" aria-label="Text alignment">
                    <pdx-button data-test="bg-first" value="left">Left</pdx-button>
                    <pdx-button data-test="bg-mid" value="center">Center</pdx-button>
                    <pdx-button data-test="bg-last" value="right">Right</pdx-button>
                </pdx-button-group>`,
        },
        {
            // mode="single" is an APG radio group: radios with aria-checked inside the
            // radiogroup, the tab stop on the selected one, and the arrows moving both focus AND selection.
            id: 'button-group-single',
            title: 'Button Group — single selection (radio group)',
            html: `
                <pdx-button-group data-test="bgs" mode="single" value="center" label="Text alignment">
                    <pdx-button data-test="bgs-left" value="left">Left</pdx-button>
                    <pdx-button data-test="bgs-center" value="center">Center</pdx-button>
                    <pdx-button data-test="bgs-right" value="right">Right</pdx-button>
                </pdx-button-group>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'button-group-basic': {
                standalone: [
                    {
                        selector: 'pdx-button-group[data-test="bg"]',
                        description: 'group host renders as inline-flex',
                        display: { op: 'is', value: 'inline-flex' },
                    },
                    {
                        selector: 'pdx-button-group[data-test="bg"] [data-test="bg-first"] button',
                        description: 'first button is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'pdx-button-group[data-test="bg"] [data-test="bg-mid"] button',
                        description: 'middle button has NO radius (joined seam)',
                        radius: { all: { op: '<=', value: 1 } },
                    },
                    {
                        selector: 'pdx-button-group[data-test="bg"] [data-test="bg-first"] button',
                        description: 'first button left radius is non-negative',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'pdx-button-group[data-test="bg"] [data-test="bg-last"] button',
                        description: 'last button right radius is non-negative',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                composition: [
                    {
                        // The three INNER buttons must have the SAME height (they are aligned in a row).
                        description: 'all buttons share the same height',
                        parent: 'pdx-button-group[data-test="bg"]',
                        children: {
                            first: '[data-test="bg-first"] button',
                            mid: '[data-test="bg-mid"] button',
                            last: '[data-test="bg-last"] button',
                        },
                        relations: [
                            { description: 'first == mid height', left: 'first.height', op: '==', right: 'mid.height', tolerance: 1 },
                            { description: 'mid == last height', left: 'mid.height', op: '==', right: 'last.height', tolerance: 1 },
                        ],
                    },
                    {
                        // Vertically aligned: the same top (one row).
                        description: 'buttons are aligned on the same row (same top)',
                        parent: 'pdx-button-group[data-test="bg"]',
                        children: {
                            first: '[data-test="bg-first"] button',
                            last: '[data-test="bg-last"] button',
                        },
                        relations: [
                            { description: 'first.top == last.top', left: 'first.top', op: '==', right: 'last.top', tolerance: 2 },
                        ],
                    },
                    {
                        // Flush and connected: the second one's left edge meets (within a few px, because of
                        // the negative margin that overlaps the borders) the first one's right edge. No gap.
                        description: 'buttons are flush (no gap between first and mid)',
                        parent: 'pdx-button-group[data-test="bg"]',
                        children: {
                            first: '[data-test="bg-first"] button',
                            mid: '[data-test="bg-mid"] button',
                        },
                        relations: [
                            { description: 'mid.left <= first.right (touching/overlapping)', left: 'mid.left', op: '<=', right: 'first.right', tolerance: 2 },
                        ],
                    },
                    {
                        // Joined: the first one's outer radius is >= the middle one's (zeroed) radius.
                        description: 'first outer radius >= middle radius (joined seam)',
                        parent: 'pdx-button-group[data-test="bg"]',
                        children: {
                            first: '[data-test="bg-first"] button',
                            mid: '[data-test="bg-mid"] button',
                        },
                        relations: [
                            { description: 'first.topLeft >= mid.topLeft', left: 'first.borderTopLeftRadius', op: '>=', right: 'mid.borderTopLeftRadius' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // role="group" plus aria-label on the host; every button has a text label → WCAG clean.
        // single: a radiogroup holding radios, not buttons with aria-pressed
        // (aria-required-children).
        scenarios: ['button-group-basic', 'button-group-single'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'button-group-basic',
        targets: [
            // The first button must keep its height (the design system's min-height)
            // even under hostile global CSS. A 10px tolerance.
            { selector: 'pdx-button-group[data-test="bg"] [data-test="bg-first"] button', tolerancePx: 10, leaks: [{ issue: 170, properties: ['letterSpacing'], themes: ['neutral'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The pattern with a keyboard to check is the radio group (mode="single"): from the
    // selected radio, ArrowRight moves the focus and aria-checked to the next one, and from the last
    // one it wraps to the first. The action group (mode="none") has no keyboard of its own: native Tab.
    keyboard: {
        scenario: 'button-group-single',
        initialFocus: 'pdx-button-group[data-test="bgs"] [data-test="bgs-center"] button',
        steps: [
            {
                key: 'ArrowRight',
                expectFocus: 'pdx-button-group[data-test="bgs"] [data-test="bgs-right"] button',
                expectAttr: { selector: 'pdx-button-group[data-test="bgs"] [data-test="bgs-right"] button', name: 'aria-checked', value: 'true' },
            },
            {
                key: 'ArrowRight',
                expectFocus: 'pdx-button-group[data-test="bgs"] [data-test="bgs-left"] button',
                expectAttr: { selector: 'pdx-button-group[data-test="bgs"] [data-test="bgs-left"] button', name: 'aria-checked', value: 'true' },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['button-group-basic'],
    },
};

export default buttonGroup;
