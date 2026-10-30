/**
 * MANIFEST — pdx-dialog (overlay, tier 2A)
 *
 * Contracts written by inspecting the source (packages/ui/src/dialog/pdx-dialog.ts) and the CSS
 * (packages/design/src/components/dialog.css, the .pdx-dialog-backdrop / .pdx-dialog-panel block).
 *
 * DOM structure: the custom element <pdx-dialog> renders inside the HOST's own render (NOT portalled to
 * the body). Its pieces are parts (#288), and the contracts select them by part:
 *   backdrop  ← fixed inset:0, flex center, bg var(--pdx-color-backdrop)
 *     root    ← the panel: role="dialog" aria-modal="true" :aria-label="title|'Dialog'"
 *       header (title, then the close part), body (the default slot), footer (slot "footer")
 *
 * Centring: the backdrop is a flex container with align and justify center → the panel is centred
 * horizontally and vertically in the viewport (the backdrop is fixed inset:0). centering:'both'.
 *
 * Base geometry (the root part): radius lg, padding 0 (the sections carry their own padding),
 * box-shadow xl, max-width 480px (md) / 360px (sm), width 90%, display flex column, max-height 85vh.
 * When it is open the host is in the custom state :state(open) (an rAF in the setup) → the panel
 * transitions to opacity 1.
 *
 * THE OPEN SCENARIO: the host carries the `open` attribute, its model, so the setup puts it in
 * :state(open) and the panel becomes measurable (opacity 1). Selectors scoped to
 * section:not([hidden]) [data-test="dlg"] [data-part=…] (host-scoping OK, nothing is portalled).
 * action:'call' in the overlay rule → the runner does NOT click, the overlay is already open.
 */
import type { ComponentManifest } from './_types';

export const dialog: ComponentManifest = {
    name: 'dialog',
    tag: 'pdx-dialog',
    tier: '2A',
    status: 'wip',
    imports: ['@pdxui/ui/dialog'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'dialog-open',
            title: 'Dialog — Open (md)',
            html: `
                <pdx-dialog data-test="dlg" open title="Confirm the operation" aria-label="Confirm the operation">
                    <p>Are you sure you want to go ahead with this operation?</p>
                    <button data-test="dlg-action" type="button" class="pdx-btn">Go ahead</button>
                    <div slot="footer">
                        <button type="button" class="pdx-ghost">Cancel</button>
                        <button type="button" class="pdx-primary">OK</button>
                    </div>
                </pdx-dialog>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'dialog-open': {
                // Standalone rules on the panel: open (opacity 1), a flex column box, radius >= 0, max-width md.
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
                        description: 'open dialog panel is fully visible (opacity 1)',
                        opacity: { op: '>=', value: 0.99 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
                        description: 'dialog panel is a flex column box',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
                        description: 'dialog panel has non-negative radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
                        description: 'dialog panel (md) constrained to a sensible max-width',
                        maxWidth: { op: '<=', value: 480 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
                        description: 'dialog panel is tall enough to hold header/body/footer',
                        height: { op: '>=', value: 80 },
                    },
                    {
                        // THE WIDTH IS THE TOKEN'S, and the same number in all 13 themes.
                        //
                        // A modal's width is a decision an application makes once — the reference
                        // uses 650 for everything and 850 for a wizard, and nothing else — so the
                        // size classes read `--pdx-dialog-width-*`, whose defaults are exactly what
                        // each size measures without one. This is the default, asserted per
                        // theme so that a theme cannot quietly invent a sixth width.
                        selector: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
                        description: 'a md dialog is exactly the width its token states (480)',
                        width: { op: '==', value: 480, tolerance: 1 },
                    },
                    {
                        // The close is in the HEADER, on the right — the reference's 36px icon
                        // button at the end of a 64px header. Measured as "inside the header",
                        // because where it is matters and how big it is per theme does not.
                        selector: 'section:not([hidden]) [data-test="dlg"] [data-part="header"] [data-part="close"]',
                        description: 'the close button is in the header',
                        width: { op: '>', value: 0 },
                    },
                ],
                // Open is a custom state of the host (#288), what a theme selects; the backdrop has no
                // attribute for it.
                states: [
                    {
                        description: 'open is the custom state :state(open), and the backdrop is drawn from it',
                        selector: 'section:not([hidden]) [data-test="dlg"] [data-part="backdrop"]',
                        trigger: 'attribute',
                        customState: { host: 'section:not([hidden]) [data-test="dlg"]', name: 'open' },
                        changes: { opacity: { op: '>=', value: 0.99 } },
                    },
                ],
                // Overlay: the panel is centred both ways in the viewport, with a backdrop.
                overlay: [
                    {
                        description: 'open dialog is centered in the viewport over a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="dlg"]', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
                        backdrop: 'section:not([hidden]) [data-test="dlg"] [data-part="backdrop"]',
                        centering: 'both',
                        hasBackdrop: true,
                        maxWidth: { op: '<=', value: 480 },
                    },
                ],
                // Composition: the header, body and footer are contained in the panel, with no horizontal overflow.
                composition: [
                    {
                        // THE ORDER OF THE FOOTER'S ACTIONS. The reference pairs them right —
                        // [outlined, contained] — and the confirming one is last, which is the
                        // position a pointer travels to and the one a keyboard reaches last.
                        // Measured as geometry, per theme, because a theme may restyle both
                        // buttons and must not reorder them.
                        description: 'the confirming action is last in the footer',
                        parent: 'section:not([hidden]) [data-test="dlg"] [data-part="footer"]',
                        children: {
                            cancel: 'section:not([hidden]) [data-test="dlg"] [data-part="footer"] .pdx-ghost',
                            ok: 'section:not([hidden]) [data-test="dlg"] [data-part="footer"] .pdx-primary',
                        },
                        relations: [
                            { description: 'cancel sits before the confirm', left: 'cancel.right', op: '<=', right: 'ok.left' },
                            { description: 'and they share a baseline', left: 'cancel.top', op: '==', right: 'ok.top', tolerance: 2 },
                        ],
                    },
                    {
                        description: 'dialog sections are contained within the panel box',
                        parent: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
                        children: {
                            panel: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
                            header: 'section:not([hidden]) [data-test="dlg"] [data-part="header"]',
                            body: 'section:not([hidden]) [data-test="dlg"] [data-part="body"]',
                            footer: 'section:not([hidden]) [data-test="dlg"] [data-part="footer"]',
                        },
                        relations: [
                            { description: 'header within panel box', left: 'header', op: 'contained-in', right: 'panel' },
                            { description: 'body within panel box', left: 'body', op: 'contained-in', right: 'panel' },
                            { description: 'footer within panel box', left: 'footer', op: 'contained-in', right: 'panel' },
                            {
                                description: 'body right edge does not overflow panel right edge',
                                left: 'body.right',
                                op: '<=',
                                right: 'panel.right',
                                tolerance: 1,
                            },
                            {
                                description: 'header sits above body (stacked column)',
                                left: 'header.bottom',
                                op: '<=',
                                right: 'body.top',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // The open scenario: the panel is role="dialog" + aria-modal="true" + aria-label (title) → accessible name OK.
        // No disableRules: the dialog exposes an accessible name, and there is no known false positive.
        scenarios: ['dialog-open'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'dialog-open',
        targets: [
            // A modal panel: it has transform:scale() (so getBoundingClientRect is scaled) and it is
            // content-driven → the height is NOT a clean invariant (skipHeight). The radius stays asserted (it is stable).
            { selector: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]', tolerancePx: 2, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) — focus trap ──
    keyboard: {
        // The initial focus is on an element inside the panel; Tab must keep the focus INSIDE the panel
        // (the dialog's focus trap). We do NOT test Esc (it would close the dialog).
        // trapContainer: after the steps, 10 Tabs and 10 Shift+Tabs stay in the panel.
        scenario: 'dialog-open',
        initialFocus: 'section:not([hidden]) [data-test="dlg-action"]',
        trapContainer: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
        steps: [
            {
                key: 'Tab',
                expectFocusWithin: 'section:not([hidden]) [data-test="dlg"] [data-part="root"]',
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['dialog-open'],
        // Drawn position: fixed, outside its section: shot as the viewport (#714).
        viewportScenarios: ['dialog-open'],
    },
};

export default dialog;
