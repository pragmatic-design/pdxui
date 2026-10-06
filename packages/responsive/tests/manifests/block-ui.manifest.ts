/**
 * MANIFEST — pdx-block-ui (loading overlay, tier 3)
 *
 * Contracts written by inspecting the source (packages/ui/src/block-ui/pdx-block-ui.ts) and the CSS
 * (packages/design/src/components/block-ui.css).
 *
 * WHAT IT DOES: it wraps some content (a <slot> by default) and, when `blocked`, shows a
 * semi-transparent overlay with a spinner (and an optional message). The data-bound components
 * (List, Table, DataGrid) use it while they load.
 *
 * THE REAL PROPS (source): `blocked: Boolean=false`, `message: String=''`, `variant: String='spinner'`.
 *   ⚠️ There is NO `loading` prop. The block is turned on by `blocked` alone.
 *   `variant: 'none'` builds no spinner; `'spinner'` (the default) does.
 *   Also `fullscreen: Boolean=false`, `delay: Number=300`, `minDuration: Number=200`:
 *   the overlay is DRAWN only after `delay`, so every scenario here says `delay="0"` — they measure
 *   the drawn overlay; the timing is ui/tests/unit/block-ui-timing.test.ts's.
 *
 * DOM STRUCTURE (built imperatively in an rAF inside ctx.track):
 *   <pdx-block-ui class="pdx-block-ui">           ← host; position: relative (CSS pdx-block-ui + tag)
 *     <slot> … wrapped content …                ← render: html`<slot></slot>`
 *     <div class="pdx-block-ui-overlay [pdx-block-ui-visible]" aria-hidden="true|false">
 *                                                  ← absolute, inset:0, z-index:10, border-radius:inherit
 *                                                  ← opacity 0 → .pdx-block-ui-visible: opacity 0.7 + pointer-events auto
 *       <div class="pdx-block-ui-spinner">         ← a flex column, there only when variant !== 'none'
 *         <pdx-spinner size="md">                  ← an SVG with the CSS @keyframes pdx-spin animation (IT SPINS → see visual/mask)
 *         <span class="pdx-block-ui-message">{message}</span>   ← there only when message is not empty
 *
 * SELECTORS VERIFIED in the CSS:
 *   .pdx-block-ui-overlay, .pdx-block-ui-visible, .pdx-block-ui-spinner, .pdx-block-ui-message.
 *
 * DETERMINISM: the overlay is built in requestAnimationFrame AFTER the setup; the scenario starts
 * already `blocked` so the overlay is visible and measurable at once (deterministic geometry:
 * inset:0 ⇒ it covers exactly the host). The SVG spinner rotates forever (the pdx-spin animation)
 * ⇒ its pixels are NOT deterministic ⇒ it is masked in the visual dimension (a mask on .pdx-block-ui-spinner).
 *
 * REAL A11Y BUGS (NOT fixed):
 *   1) No `aria-busy="true"` on the container while blocked
 *      (pdx-block-ui.ts:28-29 adds the class only, never aria-busy). WAI-ARIA: an area that is
 *      loading should expose aria-busy.
 *   2) The message is a plain <span> with no `role="status"` and no `aria-live`
 *      (pdx-block-ui.ts:44-47) ⇒ a screen reader never announces the loading text.
 *   3) The overlay is created with `aria-hidden="true"` hardcoded (pdx-block-ui.ts:32) and the FIRST
 *      build (the `if (!_built)` branch, line 54) toggles ONLY the visible class, it does not update
 *      aria-hidden ⇒ with blocked=true from the start the overlay stays aria-hidden="true" while visible.
 *   So the a11y dimension does NOT assert those attributes (they would be red): they are written down
 *   as debt, not masked. axe still runs on the scenario (it checks the contrast and the base markup).
 */
import type { ComponentManifest } from './_types';

export const blockUi: ComponentManifest = {
    name: 'block-ui',
    tag: 'pdx-block-ui',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/block-ui'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'block-ui-blocked',
            title: 'Block UI — Blocked (overlay + spinner + message)',
            // A fixed-size wrapper, so the host (and the inset:0 overlay) has a known geometry and
            // is deterministic. Deterministic inner content (static text).
            html: `
                <div style="width: 360px; height: 240px;">
                    <pdx-block-ui data-test="block" blocked delay="0" message="Loading…">
                        <div data-test="content" style="padding: 16px;">
                            <h3>Page content</h3>
                            <p>This content is covered by the blocking overlay while the data loads.</p>
                        </div>
                    </pdx-block-ui>
                </div>`,
        },
        {
            // A block taller than the window — a long form being sent. Centred on the whole block,
            // the message would sit 1,000px above the part the user is looking at.
            // block-ui-tall.spec.ts scrolls to its end and measures the message inside the viewport.
            id: 'block-ui-tall',
            title: 'Block UI — Tall block (2,000px), blocked',
            html: `
                <pdx-block-ui data-test="tall" blocked delay="0" message="Sending the prescription…">
                    <div style="height: 2000px; padding: 16px;">
                        <h3>A long form</h3>
                        <p>The "Send" button is at the end of the form.</p>
                    </div>
                </pdx-block-ui>`,
        },
        {
            // `fullscreen`: the overlay covers the viewport, not the small box it wraps.
            // Blocked by `setup`, not by markup: a fullscreen block makes the rest of the DOCUMENT
            // inert, and every tier-3 scenario shares one page — blocked from the markup, it would
            // freeze the other sections too. `inert` itself is measured in block-ui-timing.test.ts.
            id: 'block-ui-fullscreen',
            title: 'Block UI — Fullscreen, blocked',
            html: `
                <div style="width: 200px; height: 120px;">
                    <pdx-block-ui data-test="full" fullscreen delay="0" message="Saving…">
                        <p style="padding: 8px;">A small box</p>
                    </pdx-block-ui>
                </div>`,
            setup: `document.querySelector('section:not([hidden]) [data-test="full"]').blocked = true;`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, no theme-specific px) ──
    contracts: {
        scenarios: {
            'block-ui-blocked': {
                standalone: [
                    // The host: a block container with position relative (the anchor of the absolute overlay).
                    {
                        selector: 'section:not([hidden]) [data-test="block"]',
                        description: 'block-ui host is a positioned block container',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid'] },
                    },
                    // The overlay is there, in flex (it centres the spinner) and visible while blocked
                    // (opacity > 0; the CSS takes it to 0.7), with pointer-events on (it blocks the interaction).
                    {
                        selector: 'section:not([hidden]) [data-test="block"] .pdx-block-ui-overlay',
                        description: 'overlay uses flex to center the spinner',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="block"] .pdx-block-ui-overlay',
                        description: 'overlay is visible when blocked (opacity > 0)',
                        opacity: { op: '>', value: 0 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="block"] .pdx-block-ui-overlay',
                        description: 'visible overlay captures pointer events (blocks interaction)',
                        pointerEvents: { op: 'is', value: 'auto' },
                    },
                    // The spinner wrapper is there (variant defaults to 'spinner') with a positive height.
                    {
                        selector: 'section:not([hidden]) [data-test="block"] .pdx-block-ui-spinner',
                        description: 'spinner block is present and has positive height',
                        height: { op: '>', value: 0 },
                    },
                ],
                // Composition: the overlay COVERS the host (inset:0 ⇒ the same edges, within a tolerance) and the
                // spinner is CONTAINED in the overlay (centred). The wrapped content is inside the host too.
                composition: [
                    {
                        description: 'overlay covers the host and spinner is contained within the overlay',
                        parent: 'section:not([hidden]) [data-test="block"]',
                        children: {
                            host: 'section:not([hidden]) [data-test="block"]',
                            overlay: 'section:not([hidden]) [data-test="block"] .pdx-block-ui-overlay',
                            spinner: 'section:not([hidden]) [data-test="block"] .pdx-block-ui-spinner',
                            content: 'section:not([hidden]) [data-test="block"] [data-test="content"]',
                        },
                        relations: [
                            {
                                description: 'overlay is contained within the host box',
                                left: 'overlay',
                                op: 'contained-in',
                                right: 'host',
                            },
                            {
                                description: 'wrapped content is contained within the host box',
                                left: 'content',
                                op: 'contained-in',
                                right: 'host',
                            },
                            {
                                description: 'spinner is contained within the overlay box',
                                left: 'spinner',
                                op: 'contained-in',
                                right: 'overlay',
                            },
                            // The overlay (inset:0) covers the host: matching edges within tolerance.
                            {
                                description: 'overlay top aligns with host top (inset:0)',
                                left: 'overlay.top',
                                op: '<=',
                                right: 'host.top',
                                tolerance: 1,
                            },
                            {
                                description: 'overlay bottom aligns with host bottom (inset:0)',
                                left: 'host.bottom',
                                op: '<=',
                                right: 'overlay.bottom',
                                tolerance: 1,
                            },
                            {
                                description: 'overlay left aligns with host left (inset:0)',
                                left: 'overlay.left',
                                op: '<=',
                                right: 'host.left',
                                tolerance: 1,
                            },
                            {
                                description: 'overlay right aligns with host right (inset:0)',
                                left: 'host.right',
                                op: '<=',
                                right: 'overlay.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'block-ui-fullscreen': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="full"] .pdx-block-ui-overlay',
                        description: 'fullscreen overlay is drawn when blocked',
                        opacity: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        description: 'fullscreen overlay covers more than the box it wraps',
                        parent: 'body',
                        children: {
                            host: 'section:not([hidden]) [data-test="full"]',
                            overlay: 'section:not([hidden]) [data-test="full"] .pdx-block-ui-overlay',
                        },
                        relations: [
                            { description: 'the box is inside the overlay', left: 'host', op: 'contained-in', right: 'overlay' },
                            { description: 'wider than the box', left: 'overlay.width', op: '>', right: 'host.width' },
                            { description: 'taller than the box', left: 'overlay.height', op: '>', right: 'host.height' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
// axe checks the basic markup and contrast of the blocked scenario.
        // NOTE: the semantic ARIA attributes of a loading state (aria-busy on the container, role/aria-live on
        // the message) are MISSING in the source (see the BUG list in the header comment) → they cannot be
        // asserted here. Those bugs are to be fixed in the component, not silenced: no disableRules added.
        scenarios: ['block-ui-blocked'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'block-ui-blocked',
        targets: [
            // The host is content-driven (its height is the wrapper's content, sensitive to the host's font and
            // line-height): skipHeight. The width, radius and border stay asserted as the immunity guarantee.
            { selector: 'section:not([hidden]) [data-test="block"]', tolerancePx: 2, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // A block-ui BLOCKS the interaction: it has no keyboard pattern of its own. The overlay, with
        // pointer-events:auto, covers the content. There is no interactive step to assert.
        scenario: 'block-ui-blocked',
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        // One scenario; the SVG spinner rotates forever (@keyframes pdx-spin) → masked, for
        // determinism. The overlay, the background and the message are still measured and compared.
        scenarios: ['block-ui-blocked'],
        // Only the rotating spinner. Masking the whole .pdx-block-ui-spinner group would hide the
        // message from the comparison too — and that group is as tall as the block (the sticky band
        // that keeps the spinner in view), so it would hide a full strip.
        mask: ['section:not([hidden]) [data-test="block"] .pdx-block-ui-spinner pdx-spinner'],
    },
};

export default blockUi;
