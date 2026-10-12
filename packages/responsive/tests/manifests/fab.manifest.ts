/**
 * MANIFEST — pdx-fab (Floating Action Button + Speed Dial)
 *
 * Contracts DERIVED by inspecting the source and the CSS:
 *   - Source: packages/ui/src/fab/pdx-fab.ts
 *       · the HOST <pdx-fab> gets the container classes `pdx-fab-container pdx-fab-{position}`
 *         (position:fixed, z-index:90). It is NOT the button.
 *       · the round button is an INNER <button class="pdx-fab pdx-fab-{variant} pdx-fab-{size}">
 *         created in requestAnimationFrame inside ctx.track. It is the measurable element.
 *       · the button HAS an aria-label (from the `label` prop, 'Actions' by default) plus aria-haspopup and
 *         aria-expanded. → a11y is fine (an icon with no text, covered by the aria-label).
 *       · without `actions`, a click emits pdx-click (no speed dial). The base state is closed.
 *   - CSS: packages/design/src/components/fab.css
 *       · .pdx-fab → border-radius: var(--pdx-radius-full) (= 9999px), cursor:pointer, display:flex.
 *       · Sizes px: sm=40 md=56 lg=72 (width === height → a square button → a circle with the radius).
 *
 * CONSERVATIVE: no exact px on the radius (a theme may touch --pdx-radius-full, but it stays
 * high). `radius >= 16` is the cautious hint of "round", and the strong GEOMETRIC invariant is
 * width ≈ height (a square → with radius-full it becomes a circle). height/width >= 36 (below the md 56,
 * leaving room for the 0.75 compact density and for the themes).
 *
 * position:fixed → the button can end up in a corner of the viewport; getBoundingClientRect is
 * absolute, so the width, height and radius stay measurable correctly.
 *
 * The selectors are ALWAYS scoped `section:not([hidden]) ...`. The button is the inner one → `... .pdx-fab`
 * (the .pdx-fab class is on the <button>, NEVER on the host, which has .pdx-fab-container).
 */
import type { ComponentManifest } from './_types';

export const fab: ComponentManifest = {
    name: 'fab',
    tag: 'pdx-fab',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/fab'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'fab-basic',
            title: 'FAB — Basic (single action button)',
            // No `actions` → a plain button, no speed dial. The base state.
            html: `<pdx-fab data-test="fab" icon="plus" label="Add item"></pdx-fab>`,
        },
        {
            id: 'fab-sizes',
            title: 'FAB — Sizes (sm/md/lg)',
            html: `
                <pdx-fab data-test="fab-sm" size="sm" icon="plus" label="Small"></pdx-fab>
                <pdx-fab data-test="fab-md" size="md" icon="plus" label="Medium"></pdx-fab>
                <pdx-fab data-test="fab-lg" size="lg" icon="plus" label="Large"></pdx-fab>`,
        },
        {
            // A speed dial upwards: the dial comes before the FAB in the DOM, so while closed (inert) it must
            // offer no tab stop, and the action nearest the FAB is the last one in the DOM ("Copy").
            id: 'fab-speed-dial',
            title: 'FAB — Speed dial (keyboard)',
            html: `<pdx-fab data-test="fab-dial" icon="plus" label="Quick actions" direction="up"
                actions='[{"key":"share","label":"Share","icon":"share"},{"key":"print","label":"Print","icon":"printer"},{"key":"copy","label":"Copy","icon":"copy"}]'></pdx-fab>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'fab-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="fab"] .pdx-fab',
                        description: 'fab button is a flex box (display set)',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex', 'block', 'inline-block'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fab"] .pdx-fab',
                        description: 'fab button has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fab"] .pdx-fab',
                        description: 'fab button is fully opaque (base state)',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fab"] .pdx-fab',
                        description: 'fab button is at least 36px tall (md=56, margin for compact density)',
                        height: { op: '>=', value: 36 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fab"] .pdx-fab',
                        description: 'fab button is at least 36px wide',
                        width: { op: '>=', value: 36 },
                    },
                    {
                        // radius-full (9999px) → "round". A cautious >=16: even if a theme reduced
                        // the token, a FAB stays visibly rounded. The real roundness is
// guaranteed by the square composition (width == height) below.
                        selector: 'section:not([hidden]) [data-test="fab"] .pdx-fab',
                        description: 'fab button has large (round) radius',
                        radius: { all: { op: '>=', value: 16 } },
                    },
                ],
                composition: [
                    {
                        // The strong geometric invariant: width ≈ height → a square. With radius-full
                        // a square is a circle. That is what makes the FAB "round".
                        description: 'fab button is square (width == height) → round',
                        parent: 'body',
                        children: {
                            box: 'section:not([hidden]) [data-test="fab"] .pdx-fab',
                            box2: 'section:not([hidden]) [data-test="fab"] .pdx-fab',
                        },
                        relations: [
                            { description: 'width == height', left: 'box.width', op: '==', right: 'box2.height', tolerance: 2 },
                        ],
                    },
                ],
            },
            'fab-sizes': {
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg widths',
                        parent: 'body',
                        children: {
                            sm: 'section:not([hidden]) [data-test="fab-sm"] .pdx-fab',
                            md: 'section:not([hidden]) [data-test="fab-md"] .pdx-fab',
                            lg: 'section:not([hidden]) [data-test="fab-lg"] .pdx-fab',
                        },
                        relations: [
                            { description: 'sm < md', left: 'sm.width', op: '<', right: 'md.width' },
                            { description: 'md < lg', left: 'md.width', op: '<', right: 'lg.width' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // The button has an aria-label → the icon with no text passes WCAG cleanly. The closed speed dial is
        // inert: its actions are neither in the tree nor in the tab order.
        scenarios: ['fab-basic', 'fab-speed-dial'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'fab-basic',
        targets: [
            // The round button must keep its size (a fixed px per size) and its shape (the radius)
            // even under hostile global CSS. A 10px tolerance.
            { selector: 'section:not([hidden]) [data-test="fab"] .pdx-fab', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) — the speed dial as a menu ──
    // The first Tab reaches the FAB, not "Share", an invisible action of the closed dial.
    // Enter opens it and takes the focus to the nearest action; the arrow in the dial's direction
    // moves away; Escape goes back to the FAB; ArrowUp opens; Tab closes.
    keyboard: {
        scenario: 'fab-speed-dial',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="fab-dial"] button.pdx-fab' },
            { key: 'Enter', expectFocus: 'section:not([hidden]) [data-test="fab-dial"] .pdx-fab-action[aria-label="Copy"]' },
            { key: 'ArrowUp', expectFocus: 'section:not([hidden]) [data-test="fab-dial"] .pdx-fab-action[aria-label="Print"]' },
            { key: 'Escape', expectFocus: 'section:not([hidden]) [data-test="fab-dial"] button.pdx-fab' },
            { key: 'ArrowUp', expectFocus: 'section:not([hidden]) [data-test="fab-dial"] .pdx-fab-action[aria-label="Copy"]' },
            { key: 'Tab', expectAttr: { selector: 'section:not([hidden]) [data-test="fab-dial"] button.pdx-fab', name: 'aria-expanded', value: 'false' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['fab-basic'],
    },
};

export default fab;
