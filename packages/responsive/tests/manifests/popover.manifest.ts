/**
 * MANIFEST — pdx-popover (Tier 2A, floating)
 *
 * A floating "click-to-open" component on the usePopover() composable.
 * The positioning pattern is identical to the tooltip's (floating above or below the trigger),
 * but here the trigger is ACTIVATED with a CLICK (not a hover).
 *
 * ── The REAL floating selector: '.pdx-popover-float' ──
 * Confirmed in the source, packages/ui/src/popover/pdx-popover.ts:
 *   - render(): <div class="pdx-popover-float" role="dialog">…<slot></slot></div>
 *   - setup(): ctx.el.querySelector('.pdx-popover-float') for the binding and the z-index.
 * Confermato in CSS packages/design/src/components/popover.css: `.pdx-popover-float`.
 *
 * ── It is NOT portalled to the body ──
 * usePopover() (packages/core/src/component/popover.ts) does NOT appendChild to the body:
 * the content stays a child of <pdx-popover> in the DOM, and is only positioned with
 * `content.style.position = 'fixed'` plus an inline top/left. So the
 * section-scoped selector 'section:not([hidden]) .pdx-popover-float' is right and unambiguous.
 *
 * ── Declaring the trigger + the content ──
 * getTrigger() in setup() looks, in order, for:
 *   1. a [data-pdx-trigger] inside the PARENT of <pdx-popover>;
 *   2. fallback: ctx.el.previousElementSibling.
 * The trigger is NOT a child of <pdx-popover>: it is a SIBLING (or an element marked
 * [data-pdx-trigger] in the same parent). The popover's CONTENT, on the other hand, goes inside
 * <pdx-popover> (projected into the .pdx-popover-float's <slot>).
 * The markup used: <button data-pdx-trigger> plus <pdx-popover>…content…</pdx-popover>
 * as siblings in the same wrapper.
 *
 * ── Opening ──
 * trigger="click": the floating box starts at display:none and becomes visible after the click
 * on the trigger. assertPositioning performs the 'click' action and WAITS for the visibility before
 * measuring → which matches the runner.
 */
import type { ComponentManifest } from './_types';

export const popover: ComponentManifest = {
    name: 'popover',
    tag: 'pdx-popover',
    tier: '2A',
    status: 'wip',
    imports: ['@pdxui/ui/popover'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'popover-bottom',
            title: 'Popover — Bottom (click)',
            html: `
                <div>
                    <button data-test="trigger" data-pdx-trigger>Open</button>
                    <pdx-popover placement="bottom" trigger="click">
                        <div data-test="content">Popover content</div>
                    </pdx-popover>
                </div>`,
        },
        {
            // The scenario Dimension 5 photographs, and the only one that opens itself.
            //
            // `popover-bottom` and `popover-top` open on CLICK, and the visual runner never
            // interacts — `goToScenario` → `freezeAnimations` → `toHaveScreenshot`
            // (`visual-runner.spec.ts:77-90`). Their baseline would be a picture of a button labelled
            // "Open", in thirteen themes: `.pdx-popover-float` in those scenarios is present at 0x0
            // with `display: none`; after `show()` it is 199x60.
            //
            // A change to the panel's gap, or to the token that governs it, would leave the visual
            // dimension green.
            //
            // Opened through the component's own imperative API (`ctx.expose({ show() })`,
            // `pdx-popover.ts:106`) rather than by a click:
            // a `setup` bolted onto the scenario that carries the positioning contract would make
            // that contract's `waitFor({state:'visible'})` resolve whether or not the click did
            // anything. A separate scenario keeps the contract honest.
            //
            // Padding so the panel has somewhere to be, and the screenshot is a CROP of the
            // section's box, so "visible" is not enough — it has to be contained. With
            // padding on the bottom alone: the float is 199px wide, centred on a trigger sitting
            // 8px from the left edge, so it starts to the LEFT of the section and the crop cuts it.
            // `withinViewport` in the positioning contract would not catch that: the viewport
            // is not the picture. Hence the left padding too.
            id: 'popover-open',
            title: 'Popover — Open (the panel is in the picture)',
            html: `
                <div style="padding: 8px 8px 96px 140px;">
                    <button data-test="trigger" data-pdx-trigger>Open</button>
                    <pdx-popover data-test="pop" placement="bottom" trigger="click">
                        <div data-test="content">Popover content</div>
                    </pdx-popover>
                </div>`,
            setup: `
                const pop = document.querySelector('section:not([hidden]) [data-test="pop"]');
                if (pop && typeof pop.show === 'function') pop.show();`,
        },
        {
            id: 'popover-top',
            title: 'Popover — Top (click)',
            html: `
                <div style="padding-top: 240px;">
                    <button data-test="trigger" data-pdx-trigger>Open</button>
                    <pdx-popover placement="top" trigger="click">
                        <div data-test="content">Popover content</div>
                    </pdx-popover>
                </div>`,
        },
    ],

    // ── Dim. 1: the positioning contract (floating, relative to the trigger, after the click) ──
    contracts: {
        scenarios: {
            'popover-bottom': {
                positioning: [
                    {
                        description: 'popover floating placed below trigger after click',
                        trigger: { selector: 'section:not([hidden]) [data-test="trigger"]', action: 'click' },
                        floating: 'section:not([hidden]) .pdx-popover-float',
                        placement: 'bottom',
                        // The token, measured. `--pdx-float-offset` is 4px and it is what
                        // `usePopover` reads when nobody passed an offset; a tolerance of 1
                        // keeps 4 and 8 from being interchangeable. Without this rule the
                        // contract asserts only WHICH SIDE the popover is on, which a floating
                        // element flush against the trigger satisfies. Red when readFloatOffset
                        // stops reading the token.
                        gap: { op: '==', value: 4, tolerance: 1 },
                        withinViewport: true,
                        tolerance: 6,
                    },
                ],
            },
            'popover-top': {
                positioning: [
                    {
                        description: 'popover floating placed above trigger after click',
                        trigger: { selector: 'section:not([hidden]) [data-test="trigger"]', action: 'click' },
                        floating: 'section:not([hidden]) .pdx-popover-float',
                        placement: 'top',
                        // The token, measured. `--pdx-float-offset` is 4px and it is what
                        // `usePopover` reads when nobody passed an offset; a tolerance of 1
                        // keeps 4 and 8 from being interchangeable. Without this rule the
                        // contract asserts only WHICH SIDE the popover is on, which a floating
                        // element flush against the trigger satisfies. Red when readFloatOffset
                        // stops reading the token.
                        gap: { op: '==', value: 4, tolerance: 1 },
                        withinViewport: true,
                        tolerance: 6,
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // NO disableRules: the .pdx-popover-float has role="dialog" with no accessible name
    // (aria-label and aria-labelledby are missing) → axe must report it. It is a real BUG in the
    // component, not a false positive to silence.
    a11y: {
        scenarios: ['popover-bottom'],
    },

    // ── Dim. 3: style isolation (the target is the trigger button, which is stable) ──
    isolation: {
        scenario: 'popover-bottom',
        targets: [
            { selector: '[data-test="trigger"]', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard ──
    // The minimum: Tab puts the focus on the trigger (the popover opens with Enter or Space on it).
    keyboard: {
        scenario: 'popover-bottom',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="trigger"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // `popover-open`, NOT `popover-bottom`: the runner takes its screenshot at rest, and
    // `popover-bottom` opens on click, so it is never open in the picture. A baseline of a closed
    // popover is worse than none, because it still reads as coverage.
    visual: {
        scenarios: ['popover-open'],
    },
};

export default popover;
