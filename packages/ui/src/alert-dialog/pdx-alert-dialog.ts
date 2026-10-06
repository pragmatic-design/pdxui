// pdx-alert-dialog — Confirmation dialog requiring user action.
// Same pattern as pdx-dialog: CSS backdrop + data-open, overlayStack, focusTrap.
// Cannot close via backdrop or Escape by default. Auto-focuses cancel button.
// Supports: danger variant, type-to-confirm, timer-gated confirm, loading state.

import { component, html, signal } from '@pdxui/core';
// The stylesheet of the dialog classes this renders, as pdx-dialog imports it. Without it, a page
// with no pdx-dialog of its own would draw a CLOSED confirmation inline.
import '@pdxui/design/components/dialog';
import { overlayStack, focusTrap } from '@pdxui/core';
import type { Dispose } from '@pdxui/core';
import { uiString, aroundPlaceholder } from '../shared/i18n';
import { holdModalFocus } from '../shared/modal-focus';

let _alertCounter = 0;
let _alertUid = 0;

/**
 * A confirmation dialog that requires the user to act: the backdrop and Escape do not close it, and
 * Cancel takes the focus first.
 */
component('pdx-alert-dialog', {
    props: {
        open: { type: Boolean, default: false },
        /** The dialog's title. Empty: the alert-dialog.title component string, «Are you sure?». */
        title: { type: String, default: '' },
        message: { type: String, default: '' },
        variant: { type: String, default: 'default' },
        /** Label of the confirm button. Empty: the alert-dialog.confirm component string, «Confirm». */
        confirmLabel: { type: String, default: '' },
        /** Label of the cancel button. Empty: the alert-dialog.cancel component string, «Cancel». */
        cancelLabel: { type: String, default: '' },
        confirmText: { type: String, default: '' },
        confirmDelay: { type: Number, default: 0 },
        loading: { type: Boolean, default: false },
        closeOnEscape: { type: Boolean, default: false },
    },
    setup(ctx) {
        let trapDispose: Dispose | null = null;
        let dismissDispose: Dispose | null = null;
        let overlayId = '';
        let backdropEl: HTMLElement | null = null;
        let _bound = false;
        let _rafId = 0;
        const typedText = signal('');
        const countdown = signal(0);
        let countdownInterval: ReturnType<typeof setInterval> | null = null;
        // The message describes the dialog: the APG alertdialog points aria-describedby at it, so it is
        // read with the title.
        const messageId = 'pdx-alert-msg-' + (++_alertUid);

        function confirm() {
            if (!isConfirmEnabled()) return;
            (ctx.el as any).open = false;
            ctx.emit('pdx-confirm');
        }

        function cancel() {
            (ctx.el as any).open = false;
            ctx.emit('pdx-cancel');
        }

        function isConfirmEnabled(): boolean {
            if (ctx.loading()) return false;
            const ct = ctx.confirmText() as string;
            if (ct && typedText() !== ct) return false;
            if (countdown() > 0) return false;
            return true;
        }

        function onTypedInput(e: Event) {
            typedText.set((e.target as HTMLInputElement).value);
        }

        ctx.track(() => {
            const isOpen = ctx.open();

            // Bind DOM refs once
            if (!_bound) {
                _bound = true;
                requestAnimationFrame(() => {
                    backdropEl = ctx.el.querySelector('.pdx-dialog-backdrop');
                    const panel = ctx.el.querySelector('.pdx-dialog-panel') as HTMLElement | null;
                    if (backdropEl && panel) holdModalFocus(backdropEl, panel);
                    // Wire buttons
                    const confirmBtn = ctx.el.querySelector('.pdx-alert-confirm') as HTMLElement;
                    const cancelBtn = ctx.el.querySelector('.pdx-alert-cancel') as HTMLElement;
                    if (confirmBtn) confirmBtn.onclick = confirm;
                    if (cancelBtn) cancelBtn.onclick = cancel;
                });
            }

            if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
            _rafId = requestAnimationFrame(() => {
                _rafId = 0;
                if (isOpen) {
                    overlayId = 'pdx-alert-' + (++_alertCounter);
                    const zIndex = overlayStack.push(overlayId, { modal: true });
                    if (backdropEl) {
                        backdropEl.style.zIndex = String(zIndex);
                        backdropEl.setAttribute('data-open', '');
                    }

                    // Reset state — the typed text in the field too: otherwise, reopened, it would still
                    // show the text of the last time while confirm, gated on the cleared signal, is disabled.
                    typedText.set('');
                    const typeInput = ctx.el.querySelector('.pdx-alert-type-input') as HTMLInputElement | null;
                    if (typeInput) typeInput.value = '';
                    countdown.set(0);

                    // Timer-gated confirm
                    const delay = ctx.confirmDelay() as number;
                    if (delay > 0) {
                        countdown.set(delay);
                        countdownInterval = setInterval(() => {
                            const c = countdown() - 1;
                            countdown.set(c);
                            if (c <= 0 && countdownInterval) {
                                clearInterval(countdownInterval);
                                countdownInterval = null;
                            }
                        }, 1000);
                    }

                    if (ctx.closeOnEscape()) {
                        dismissDispose = overlayStack.onDismissTop(cancel);
                    }

                    // Focus trap + auto-focus cancel
                    requestAnimationFrame(() => {
                        const panel = ctx.el.querySelector('.pdx-dialog-panel') as HTMLElement;
                        if (panel) trapDispose = focusTrap(panel, { restoreFocus: true });
                        const cancelBtn = ctx.el.querySelector('.pdx-alert-cancel') as HTMLElement;
                        if (cancelBtn) setTimeout(() => cancelBtn.focus(), 0);
                    });
                } else {
                    if (backdropEl) backdropEl.removeAttribute('data-open');
                    if (trapDispose) { trapDispose(); trapDispose = null; }
                    if (dismissDispose) { dismissDispose(); dismissDispose = null; }
                    if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
                }
            });

            return () => {
                if (trapDispose) { trapDispose(); trapDispose = null; }
                if (dismissDispose) { dismissDispose(); dismissDispose = null; }
                if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            };
        });

        // Imperative API: el.show() / el.close() / el.toggle() / el.isOpen + confirm()/cancel()
        ctx.expose({
            show() { (ctx.el as any).open = true; },
            close: cancel,
            toggle() { if (ctx.open()) cancel(); else (ctx.el as any).open = true; },
            get isOpen() { return ctx.open() as boolean; },
            /** Confirm and close, as the confirm button does. Does nothing while that button is held back — loading, a countdown running, or a confirmation phrase not yet typed. */
            confirm,
            /** Close and emit `pdx-cancel`. */
            cancel,
        });

        // The title, and the type-to-confirm sentence around its <strong>, from the component strings
        // when not set: an English default here would be «Are you sure?» in every locale.
        const resolvedTitle = (): string => (ctx.title() as string) || uiString('alert-dialog', 'title');
        const typeToConfirm = (): [string, string] => aroundPlaceholder(uiString('alert-dialog', 'typeToConfirm'), 'text');

        return { confirm, cancel, isConfirmEnabled, typedText, countdown, resolvedTitle, typeToConfirm, onTypedInput, messageId };
    },
    render: (ctx) => html`
        <div class="pdx-dialog-backdrop">
            <div class="pdx-dialog-panel pdx-dialog-sm" role="alertdialog" aria-modal="true"
                :aria-label="${ctx.resolvedTitle}"
                :aria-describedby="${() => ctx.message() ? ctx.messageId : null}">
                <div class="pdx-dialog-header">
                    <span>${ctx.resolvedTitle}</span>
                </div>
                <div class="pdx-dialog-body">
                    ${() => ctx.message() ? html`<p :id="${() => ctx.messageId}" style="margin:0 0 var(--pdx-space-md);color:var(--pdx-color-muted)">${ctx.message}</p>` : ''}
                    <slot></slot>
                    ${() => ctx.confirmText() ? html`
                        <div style="margin-top:var(--pdx-space-md)">
                            <p class="pdx-txt-small pdx-ink-muted" style="margin-bottom:var(--pdx-space-xs)">${() => ctx.typeToConfirm()[0]}<strong>${ctx.confirmText}</strong>${() => ctx.typeToConfirm()[1]}</p>
                            <input class="pdx-alert-type-input pdx-input" type="text" @input="${ctx.onTypedInput}" />
                        </div>
                    ` : ''}
                </div>
                <div class="pdx-dialog-footer">
                    <button class="pdx-alert-cancel pdx-ghost" type="button" size="sm">${() => (ctx.cancelLabel() as string) || uiString('alert-dialog', 'cancel')}</button>
                    <button class="pdx-alert-confirm ${() => (ctx.variant() as string) === 'danger' ? 'pdx-danger' : 'pdx-primary'}" type="button" size="sm"
                        :disabled="${() => !ctx.isConfirmEnabled()}">${() => {
                            const c = ctx.countdown();
                            const label = (ctx.confirmLabel() as string) || uiString('alert-dialog', 'confirm');
                            return c > 0 ? `${label} (${c}s)` : label;
                        }}</button>
                </div>
            </div>
        </div>
    `,
});
