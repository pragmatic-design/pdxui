/**
 * MANIFEST — pdx-alert-dialog (overlay, tier 2A)
 *
 * Contracts written by inspecting the source (packages/ui/src/alert-dialog/pdx-alert-dialog.ts) and
 * the CSS (packages/design/src/components/dialog.css — it reuses .pdx-dialog-backdrop /
 * .pdx-dialog-panel).
 *
 * DOM structure: the custom element <pdx-alert-dialog> renders inside the HOST's own render (it is
 * NOT portalled to the body):
 *   <div class="pdx-dialog-backdrop">                       ← fixed inset:0, flex center
 *     <div class="pdx-dialog-panel pdx-dialog-sm" role="alertdialog" aria-modal="true" :aria-label="title">
 *       <div class="pdx-dialog-header"><span>{title}</span></div>   ← no close button
 *       <div class="pdx-dialog-body"> {message?} <slot> {confirmText input?} </div>
 *       <div class="pdx-dialog-footer">
 *         <button class="pdx-alert-cancel pdx-ghost">{cancelLabel}</button>
 *         <button class="pdx-alert-confirm pdx-primary|pdx-danger" :disabled="!isConfirmEnabled">{confirmLabel}</button>
 *
 * How it differs from dialog: role="alertdialog" (not "dialog"), a panel FIXED at .pdx-dialog-sm
 * (360px), no close button, a footer ALWAYS present with cancel + confirm, a danger variant on the
 * confirm, and closeOnEscape false by default (Esc and the backdrop do not close it). The centring
 * is identical (the backdrop is a flex centre).
 *
 * THE OPEN SCENARIO: a host with `open` → the backdrop gets [data-open] (rAF setup), the panel is at
 * opacity 1 and measurable. The selectors are host-scoped (nothing is portalled). overlay
 * action:'call' → the runner does NOT click.
 */
import type { ComponentManifest } from './_types';

export const alertDialog: ComponentManifest = {
    name: 'alert-dialog',
    tag: 'pdx-alert-dialog',
    tier: '2A',
    status: 'wip',
    imports: ['@pdxui/ui/alert-dialog'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'alert-open',
            title: 'Alert Dialog — Open (confirm/cancel)',
            html: `
                <pdx-alert-dialog data-test="alert" open
                    title="Delete item"
                    message="This action cannot be undone."
                    aria-label="Delete item"
                    confirm-label="Delete"
                    cancel-label="Cancel">
                </pdx-alert-dialog>`,
        },
        {
            id: 'alert-danger',
            title: 'Alert Dialog — Open (danger variant)',
            html: `
                <pdx-alert-dialog data-test="alert-danger" open
                    variant="danger"
                    title="Delete account"
                    message="All the data will be lost for good."
                    aria-label="Delete account"
                    confirm-label="Delete account"
                    cancel-label="Cancel">
                </pdx-alert-dialog>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'alert-open': {
                // Standalone rules on the panel: open (opacity 1), a flex column box, radius >= 0, max-width sm (360px).
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
                        description: 'open alert-dialog panel is fully visible (opacity 1)',
                        opacity: { op: '>=', value: 0.99 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
                        description: 'alert-dialog panel is a flex column box',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
                        description: 'alert-dialog panel has non-negative radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
                        description: 'alert-dialog panel is fixed to the small size (<=360px)',
                        maxWidth: { op: '<=', value: 360 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
                        description: 'alert-dialog panel is tall enough to hold header/body/footer',
                        height: { op: '>=', value: 80 },
                    },
                    // The footer's two action buttons have cursor: pointer.
                    {
                        selector: 'section:not([hidden]) [data-test="alert"] .pdx-alert-confirm',
                        description: 'confirm button has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="alert"] .pdx-alert-cancel',
                        description: 'cancel button has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                // Overlay: the panel is centred both ways in the viewport, the backdrop is there, max-width sm.
                overlay: [
                    {
                        description: 'open alert-dialog is centered in the viewport over a backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="alert"]', action: 'call' },
                        panel: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
                        backdrop: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-backdrop',
                        centering: 'both',
                        hasBackdrop: true,
                        maxWidth: { op: '<=', value: 360 },
                    },
                ],
                // Composition: confirm and cancel sit inside the footer and the panel, and the
                // footer sits under the body.
                composition: [
                    {
                        description: 'alert-dialog action buttons are contained within the panel footer',
                        parent: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
                        children: {
                            panel: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
                            body: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-body',
                            footer: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-footer',
                            cancel: 'section:not([hidden]) [data-test="alert"] .pdx-alert-cancel',
                            confirm: 'section:not([hidden]) [data-test="alert"] .pdx-alert-confirm',
                        },
                        relations: [
                            { description: 'cancel within panel box', left: 'cancel', op: 'contained-in', right: 'panel' },
                            { description: 'confirm within panel box', left: 'confirm', op: 'contained-in', right: 'panel' },
                            { description: 'cancel within footer', left: 'cancel', op: 'contained-in', right: 'footer' },
                            { description: 'confirm within footer', left: 'confirm', op: 'contained-in', right: 'footer' },
                            {
                                description: 'footer sits below body (stacked column)',
                                left: 'body.bottom',
                                op: '<=',
                                right: 'footer.top',
                                tolerance: 1,
                            },
                            {
                                description: 'confirm is to the right of cancel (footer flex-end order)',
                                left: 'cancel.right',
                                op: '<=',
                                right: 'confirm.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            // The danger scenario is mostly for the visual and a11y dimensions; there is no
            // universal colour rule (it depends on the theme), and the containment is already
            // covered by alert-open.
            'alert-danger': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="alert-danger"] .pdx-dialog-panel',
                        description: 'danger alert-dialog panel is fully visible (opacity 1)',
                        opacity: { op: '>=', value: 0.99 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // The open scenario: the panel has role="alertdialog" + aria-modal="true" + aria-label (the title) → the accessible name is fine.
        // No disableRules.
        scenarios: ['alert-open', 'alert-danger'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'alert-open',
        targets: [
            // A scaled, content-driven modal panel (see dialog) → skipHeight; the radius is asserted.
            { selector: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel', tolerancePx: 2, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) — focus trap ──
    keyboard: {
        // The component auto-focuses cancel on setup. The initial focus is on cancel; Tab must keep
        // the focus INSIDE the panel (focus trap). We do NOT test Esc — closeOnEscape is false by
        // default anyway, and this keeps the test free of that dependency.
        // trapContainer: after the steps, 10 Tabs and 10 Shift+Tabs stay in the panel.
        scenario: 'alert-open',
        initialFocus: 'section:not([hidden]) [data-test="alert"] .pdx-alert-cancel',
        trapContainer: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
        steps: [
            {
                key: 'Tab',
                expectFocusWithin: 'section:not([hidden]) [data-test="alert"] .pdx-dialog-panel',
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['alert-open', 'alert-danger'],
    },
};

export default alertDialog;
