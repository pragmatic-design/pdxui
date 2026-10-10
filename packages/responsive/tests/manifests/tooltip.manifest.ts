/**
 * MANIFEST — pdx-tooltip (Tier 2A, floating)
 *
 * Positioning contract taken FAITHFULLY from tooltip-position.spec.ts:
 * - top:    tooltip.bottom <= trigger.top (above)
 * - bottom: tooltip.top >= trigger.bottom (below)
 * - left:   tooltip.right <= trigger.left (left of)
 * - right:  tooltip.left >= trigger.right (right of)
 * a 4px tolerance, and it must stay inside the viewport.
 *
 * Floating selector: '.pdx-tooltip-float' — confirmed in tooltip-position.spec.ts,
 * where the floating element is reached as
 * trigger.nextElementSibling (PDX-TOOLTIP) → .querySelector('.pdx-tooltip-float').
 */
import type { ComponentManifest } from './_types';

export const tooltip: ComponentManifest = {
    name: 'tooltip',
    tag: 'pdx-tooltip',
    tier: '2A',
    status: 'wip',
    imports: ['@pdxui/ui/tooltip'],

// ── Scenarios ──
    scenarios: [
        {
            id: 'tooltip-top',
            title: 'Tooltip — Top',
            html: `
                <button data-test="trigger">Hover me</button>
                <pdx-tooltip placement="top" text="Tooltip content" delay="0"></pdx-tooltip>`,
        },
        {
            id: 'tooltip-bottom',
            title: 'Tooltip — Bottom',
            html: `
                <button data-test="trigger">Hover me</button>
                <pdx-tooltip placement="bottom" text="Tooltip content" delay="0"></pdx-tooltip>`,
        },
        {
            id: 'tooltip-left',
            title: 'Tooltip — Left',
            html: `
                <div style="padding-left: 200px;">
                    <button data-test="trigger">Hover me</button>
                    <pdx-tooltip placement="left" text="Tooltip content" delay="0"></pdx-tooltip>
                </div>`,
        },
        {
            id: 'tooltip-right',
            title: 'Tooltip — Right',
            html: `
                <button data-test="trigger">Hover me</button>
                <pdx-tooltip placement="right" text="Tooltip content" delay="0"></pdx-tooltip>`,
        },
        {
            // The scenario Dimension 5 photographs, and the only one that opens itself.
            //
            // The four above open on HOVER, and the visual runner takes its screenshot at rest —
            // `goToScenario` → `freezeAnimations` → `toHaveScreenshot`, with no interaction
            // (`visual-runner.spec.ts:77-90`). So `tooltip-top`'s baseline would be a picture of the
            // trigger button with no tooltip in it, in all thirteen themes, green through a change
            // that moves every tooltip 4px. Measured: the
            // `.pdx-tooltip-float` in that scenario is present at 0x0 with `display: none`.
            //
            // Opened through the component's own imperative API (`ctx.expose({ show() })`,
            // `pdx-tooltip.ts:156`), which is the shape `select-open` and `date-picker-open`
            // already use. The runner does not hover: that would change what a resting screenshot
            // means for all 117 visual scenarios to fix one.
            //
            // Padding so the tooltip has somewhere to be: `placement="bottom"` keeps it inside the
            // captured section, which a `top` placement on a trigger at y=0 would not.
            id: 'tooltip-open',
            title: 'Tooltip — Open (the tooltip is in the picture)',
            html: `
                <div style="padding: 8px 8px 96px;">
                    <button data-test="trigger">Hover me</button>
                    <pdx-tooltip data-test="tip" placement="bottom" text="Tooltip content" delay="0"></pdx-tooltip>
                </div>`,
            setup: `
                const tip = document.querySelector('section:not([hidden]) [data-test="tip"]');
                if (tip && typeof tip.show === 'function') tip.show();`,
        },
    ],

    // ── Dim. 1: the positioning contract (from tooltip-position.spec.ts) ──
    contracts: {
        scenarios: {
            'tooltip-top': {
                positioning: [
                    {
                        description: 'tooltip placed above trigger, centered',
                        trigger: { selector: 'section:not([hidden]) [data-test="trigger"]', action: 'hover' },
                        floating: 'section:not([hidden]) .pdx-tooltip-float',
                        placement: 'top',
                        // 4: the token, not a hardcode. An explicit `offset` passed to usePopover
                        // is exactly what stops it reading `--pdx-float-offset` — a theme setting
                        // the token would then move the popover and the select and leave the
                        // tooltip where it is. No visual baseline guards this: Dimension 5
                        // photographs the scenario at rest and a tooltip opens on hover, so
                        // `tooltip-top` at rest has no tooltip in it.
                        //
                        // The rule is what makes it a gate. Without it the contract checks only
                        // WHICH SIDE the tooltip is on, and a floating element flush against its
                        // trigger passes. Red when readFloatOffset stops reading the token.
                        gap: { op: '==', value: 4, tolerance: 1 },
                        withinViewport: true,
                        tolerance: 4,
                    },
                ],
            },
            'tooltip-bottom': {
                positioning: [
                    {
                        description: 'tooltip placed below trigger, centered',
                        trigger: { selector: 'section:not([hidden]) [data-test="trigger"]', action: 'hover' },
                        floating: 'section:not([hidden]) .pdx-tooltip-float',
                        placement: 'bottom',
                        // 4: the token, not a hardcode. An explicit `offset` passed to usePopover
                        // is exactly what stops it reading `--pdx-float-offset` — a theme setting
                        // the token would then move the popover and the select and leave the
                        // tooltip where it is. No visual baseline guards this: Dimension 5
                        // photographs the scenario at rest and a tooltip opens on hover, so
                        // `tooltip-top` at rest has no tooltip in it.
                        //
                        // The rule is what makes it a gate. Without it the contract checks only
                        // WHICH SIDE the tooltip is on, and a floating element flush against its
                        // trigger passes. Red when readFloatOffset stops reading the token.
                        gap: { op: '==', value: 4, tolerance: 1 },
                        withinViewport: true,
                        tolerance: 4,
                    },
                ],
            },
            'tooltip-left': {
                positioning: [
                    {
                        description: 'tooltip placed left of trigger, vertically centered',
                        trigger: { selector: 'section:not([hidden]) [data-test="trigger"]', action: 'hover' },
                        floating: 'section:not([hidden]) .pdx-tooltip-float',
                        placement: 'left',
                        // 4: the token, not a hardcode. An explicit `offset` passed to usePopover
                        // is exactly what stops it reading `--pdx-float-offset` — a theme setting
                        // the token would then move the popover and the select and leave the
                        // tooltip where it is. No visual baseline guards this: Dimension 5
                        // photographs the scenario at rest and a tooltip opens on hover, so
                        // `tooltip-top` at rest has no tooltip in it.
                        //
                        // The rule is what makes it a gate. Without it the contract checks only
                        // WHICH SIDE the tooltip is on, and a floating element flush against its
                        // trigger passes. Red when readFloatOffset stops reading the token.
                        gap: { op: '==', value: 4, tolerance: 1 },
                        withinViewport: true,
                        tolerance: 4,
                    },
                ],
            },
            'tooltip-right': {
                positioning: [
                    {
                        description: 'tooltip placed right of trigger, vertically centered',
                        trigger: { selector: 'section:not([hidden]) [data-test="trigger"]', action: 'hover' },
                        floating: 'section:not([hidden]) .pdx-tooltip-float',
                        placement: 'right',
                        // 4: the token, not a hardcode. An explicit `offset` passed to usePopover
                        // is exactly what stops it reading `--pdx-float-offset` — a theme setting
                        // the token would then move the popover and the select and leave the
                        // tooltip where it is. No visual baseline guards this: Dimension 5
                        // photographs the scenario at rest and a tooltip opens on hover, so
                        // `tooltip-top` at rest has no tooltip in it.
                        //
                        // The rule is what makes it a gate. Without it the contract checks only
                        // WHICH SIDE the tooltip is on, and a floating element flush against its
                        // trigger passes. Red when readFloatOffset stops reading the token.
                        gap: { op: '==', value: 4, tolerance: 1 },
                        withinViewport: true,
                        tolerance: 4,
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['tooltip-top'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'tooltip-top',
        targets: [
            { selector: '[data-test="trigger"]', tolerancePx: 6, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // ── Dim. 5: visual regression ──
    // `tooltip-open`, NOT `tooltip-top`. The four placement scenarios open on hover and the visual
    // runner never interacts, so photographing one of them produces a baseline with no tooltip in
    // it — green in thirteen themes, and green through a change that moves every tooltip. A
    // baseline like that is worse than none, because it still looks like coverage.
    visual: {
        scenarios: ['tooltip-open'],
    },
};

export default tooltip;
