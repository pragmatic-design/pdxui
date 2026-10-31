/**
 * MANIFEST — pdx-overlay-outlet (overlay holder, tier 2A)
 *
 * Contracts written by inspecting the source (packages/ui/src/overlay/pdx-overlay-outlet.ts), the
 * service that feeds it (packages/ui/src/dialog/dialog-service.ts) and the CSS it borrows
 * (packages/design/src/components/dialog.css).
 *
 * The outlet draws the page's dialog queue: `dialog.confirm()`, `dialog.alert()` and `dialog.open()`
 * push to it, and it renders each into its own light DOM, the dialog's markup and classes:
 *   <div class="pdx-overlay-container" data-part="root">
 *     <div class="pdx-dialog-backdrop" data-part="backdrop" data-dialog-id data-open>   ← one per dialog
 *       <div class="pdx-dialog-panel pdx-dialog-sm" data-part="panel" role="alertdialog" aria-modal="true">
 *         <div data-part="header"><span data-part="title">…</span>[<button data-part="close">]</div>
 *         <div data-part="body"><p data-part="message">…</p>[<input data-part="confirm-input">]</div>
 *         <div data-part="footer"> cancel + confirm (a confirm) | ok (an alert) </div>
 *
 * THE SCENARIO opens a confirm and then an alert from code (#288): two modals, the alert on top. The
 * selectors keep to the backdrops that are `[data-open]` — a dialog that closed stays 200 ms for its
 * exit, without it — and tell the two apart by the button each has (`cancel`, `ok`). The setup waits,
 * a frame at a time, until the alert's OK has the focus, which is the last thing the outlet does.
 *
 * There is ONE scenario: the queue is the page's, and every outlet on the page draws all of it, so a
 * second scenario's outlet — in a hidden section of the same tier page — would draw these dialogs too.
 */
import type { ComponentManifest } from './_types';

const OPEN = 'section:not([hidden]) [data-test="outlet"] [data-part="backdrop"][data-open]';
const CONFIRM = `${OPEN}:has([data-part="cancel"])`;
const ALERT = `${OPEN}:has([data-part="ok"])`;

export const overlayOutlet: ComponentManifest = {
    name: 'overlay-outlet',
    tag: 'pdx-overlay-outlet',
    tier: '2A',
    status: 'wip',
    imports: ['@pdxui/ui/overlay-outlet'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'outlet-confirm-alert',
            title: 'Overlay Outlet — a confirm and an alert opened from code',
            html: `<pdx-overlay-outlet data-test="outlet"></pdx-overlay-outlet>`,
            setup: `
                const { dialog } = await import('@pdxui/ui/dialog-service');
                dialog.closeAll();
                void dialog.confirm({ title: 'Delete item', message: 'This action cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
                void dialog.alert({ title: 'Saved', message: 'Your changes are saved.' });
                const ok = '${ALERT} [data-part="ok"]';
                for (let i = 0; i < 120 && !document.querySelector(ok)?.matches(':focus'); i++) {
                    await new Promise((r) => requestAnimationFrame(r));
                }`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'outlet-confirm-alert': {
                standalone: [
                    {
                        selector: `${ALERT} [data-part="panel"]`,
                        description: 'the alert on top is fully visible (opacity 1)',
                        opacity: { op: '>=', value: 0.99 },
                    },
                    {
                        selector: `${CONFIRM} [data-part="panel"]`,
                        description: 'the confirm under it is drawn too (opacity 1)',
                        opacity: { op: '>=', value: 0.99 },
                    },
                    {
                        selector: `${ALERT} [data-part="panel"]`,
                        description: 'a dialog from code is a flex column box',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: `${ALERT} [data-part="panel"]`,
                        description: 'a confirm or an alert is the small size (<=360px)',
                        maxWidth: { op: '<=', value: 360 },
                    },
                    {
                        selector: `${CONFIRM} [data-part="confirm"]`,
                        description: 'confirm button has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: `${ALERT} [data-part="ok"]`,
                        description: 'OK button has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                overlay: [
                    {
                        description: 'the alert is centered in the viewport over its backdrop',
                        trigger: { selector: 'section:not([hidden]) [data-test="outlet"]', action: 'call' },
                        panel: `${ALERT} [data-part="panel"]`,
                        backdrop: ALERT,
                        centering: 'both',
                        hasBackdrop: true,
                        maxWidth: { op: '<=', value: 360 },
                    },
                ],
                composition: [
                    {
                        description: 'the confirm\'s buttons are in its footer, cancel before confirm',
                        parent: `${CONFIRM} [data-part="panel"]`,
                        children: {
                            panel: `${CONFIRM} [data-part="panel"]`,
                            body: `${CONFIRM} [data-part="body"]`,
                            footer: `${CONFIRM} [data-part="footer"]`,
                            cancel: `${CONFIRM} [data-part="cancel"]`,
                            confirm: `${CONFIRM} [data-part="confirm"]`,
                        },
                        relations: [
                            { description: 'cancel within footer', left: 'cancel', op: 'contained-in', right: 'footer' },
                            { description: 'confirm within footer', left: 'confirm', op: 'contained-in', right: 'footer' },
                            { description: 'footer within panel', left: 'footer', op: 'contained-in', right: 'panel' },
                            { description: 'footer sits below body', left: 'body.bottom', op: '<=', right: 'footer.top', tolerance: 1 },
                            { description: 'confirm is to the right of cancel', left: 'cancel.right', op: '<=', right: 'confirm.right', tolerance: 1 },
                        ],
                    },
                    {
                        description: 'the alert\'s OK is in its footer',
                        parent: `${ALERT} [data-part="panel"]`,
                        children: {
                            panel: `${ALERT} [data-part="panel"]`,
                            footer: `${ALERT} [data-part="footer"]`,
                            ok: `${ALERT} [data-part="ok"]`,
                        },
                        relations: [
                            { description: 'OK within footer', left: 'ok', op: 'contained-in', right: 'footer' },
                            { description: 'footer within panel', left: 'footer', op: 'contained-in', right: 'panel' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // Each panel is role="alertdialog" + aria-modal + aria-label (its title), described by its message.
        scenarios: ['outlet-confirm-alert'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'outlet-confirm-alert',
        targets: [
            // A content-driven modal panel, as the dialog's → skipHeight; the radius is asserted.
            { selector: `${ALERT} [data-part="panel"]`, tolerancePx: 2, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) — focus on open, and the trap of the dialog on top ──
    keyboard: {
        // The outlet focuses the top dialog's OK; Tab stays in that dialog, not the confirm under it.
        scenario: 'outlet-confirm-alert',
        initialFocus: `${ALERT} [data-part="ok"]`,
        trapContainer: `${ALERT} [data-part="panel"]`,
        steps: [
            { key: 'Tab', expectFocusWithin: `${ALERT} [data-part="panel"]` },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['outlet-confirm-alert'],
        // Drawn position: fixed, outside its section: shot as the viewport (#714).
        viewportScenarios: ['outlet-confirm-alert'],
    },
};

export default overlayOutlet;
