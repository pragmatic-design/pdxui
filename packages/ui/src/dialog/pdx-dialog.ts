// pdx-dialog — Modal dialog with backdrop, focus trap, Escape close.
// Uses overlayStack for z-index management and Escape coordination.
// Same pattern as pdx-drawer: backdrop + panel in render template, CSS visibility.

import { component, html } from '@pdxui/core';
import { focusTrap, overlayStack } from '@pdxui/core';
import type { Dispose } from '@pdxui/core';
import { uiString } from '../shared/i18n';
import { holdModalFocus } from '../shared/modal-focus';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/dialog';

// Re-export programmatic API (facade pattern — same as toast in pdx-toast.ts)
export { dialog, getDialogQueue } from './dialog-service';

let _dialogCounter = 0;

/**
 * Modal dialog with backdrop, focus trap and Escape-to-close.
 *
 * @summary Modal window: overlay with focus trap, z-index managed via overlayStack, Escape-to-close.
 * @slot - The dialog body (main content).
 * @slot footer - Action area at the bottom (e.g. Confirm/Cancel); hidden automatically when empty.
 * @fires pdx-before-close - Fired (cancelable) before closing; call preventDefault() to block it.
 * @fires pdx-close - Fired after the dialog closes.
 */
component('pdx-dialog', {
    props: {
        open: { type: Boolean, default: false },
        title: { type: String, default: '' },
        size: { type: String, default: 'md', enum: ['sm', 'md', 'lg', 'xl', 'full'] },
        closeOnBackdrop: { type: Boolean, default: true },
        closeOnEscape: { type: Boolean, default: true },
        showClose: { type: Boolean, default: true },
        initialfocus: { type: String, default: '' },
        preventClose: { type: Boolean, default: false },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    setup(ctx) {
        let trapDispose: Dispose | null = null;
        let dismissDispose: Dispose | null = null;
        let overlayId = '';
        let scrollCleanup: (() => void) | null = null;
        let backdropEl: HTMLElement | null = null;
        let panelEl: HTMLElement | null = null;
        let _bound = false;
        let _rafId = 0;
        let _innerRafId = 0;

        /**
         * A close attempt.
         *
         * `byUser` is every way the person in front of the screen can dismiss the dialog — Escape,
         * the backdrop, the ✕. `prevent-close` blocks exactly those and nothing else: `close()` is
         * the AUTHOR asking, and it is answered, or the prop would leave a consumer with no way out
         * except assigning `open = false` and a `close()` method that lies.
         *
         * `pdx-before-close` fires either way: blocking silently would be worse than closing,
         * because an app that wants "you have unsaved changes" needs to know the attempt happened.
         */
        function tryClose(byUser = true) {
            // Always emit cancelable before-close — consumer decides whether to block
            const event = new CustomEvent('pdx-before-close', {
                bubbles: true, cancelable: true,
            });
            ctx.el.dispatchEvent(event);
            if (event.defaultPrevented) return;
            if (byUser && ctx.preventClose() as boolean) return;
            doClose();
        }

        function doClose() {
            (ctx.el as any).open = false;
            ctx.emit('pdx-close', undefined, { bubbles: false });
        }

        function setupScrollShadow(el: HTMLElement) {
            function update() {
                const { scrollTop, scrollHeight, clientHeight } = el;
                el.classList.toggle('pdx-scroll-top', scrollTop > 4);
                el.classList.toggle('pdx-scroll-bottom', scrollTop + clientHeight < scrollHeight - 4);
            }
            el.addEventListener('scroll', update, { passive: true });
            requestAnimationFrame(update);
            return () => el.removeEventListener('scroll', update);
        }

        function focusInitial() {
            // Search in ctx.el (Light DOM: slot content is under host, not panel)
            const root = ctx.el;
            const sel = ctx.initialfocus() as string;
            if (sel) {
                const target = root.querySelector(sel) as HTMLElement;
                if (target) { target.focus(); return; }
            }
            // Default: first focusable inside the dialog body
            const body = root.querySelector('.pdx-dialog-body');
            if (body) {
                const first = body.querySelector(
                    'button:not(.pdx-dialog-close), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                ) as HTMLElement;
                if (first) { first.focus(); return; }
            }
            // Fallback: close button
            const closeBtn = root.querySelector('.pdx-dialog-close') as HTMLElement;
            if (closeBtn) closeBtn.focus();
        }

        ctx.track(() => {
            const isOpen = ctx.open();
            const size = ctx.size() as string || 'md';

            if (ctx.loading()) ctx.el.setAttribute('aria-busy', 'true');
            else ctx.el.removeAttribute('aria-busy');

            // Bind DOM refs once
            if (!_bound) {
                _bound = true;
                requestAnimationFrame(() => {
                    backdropEl = ctx.el.querySelector('.pdx-dialog-backdrop');
                    panelEl = ctx.el.querySelector('.pdx-dialog-panel');
                    if (backdropEl) {
                        backdropEl.onclick = (e: MouseEvent) => {
                            if (ctx.closeOnBackdrop() && e.target === backdropEl) tryClose();
                        };
                    }
                    // A click on the backdrop or on the dialog's text keeps focus inside.
                    if (backdropEl && panelEl) holdModalFocus(backdropEl, panelEl);
                    const closeBtn = ctx.el.querySelector('.pdx-dialog-close');
                    // Wrapped, not passed: as a handler it would receive the MouseEvent as
                    // `byUser`, which is truthy and so happens to be right — for the wrong reason.
                    if (closeBtn) (closeBtn as HTMLElement).onclick = () => tryClose();
                });
            }

            // Cancel any pending open/close rAF to prevent race conditions
            if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
            if (_innerRafId) { cancelAnimationFrame(_innerRafId); _innerRafId = 0; }
            _rafId = requestAnimationFrame(() => {
                _rafId = 0;
                // Lazy (re)resolve: the once-on-mount capture above runs in a rAF and can miss the panel if the
                // render hasn't painted it yet (render timing in a real browser differs from jsdom) — leaving
                // panelEl/backdropEl null forever so data-open is never set and the dialog never opens.
                if (!panelEl) panelEl = ctx.el.querySelector('.pdx-dialog-panel');
                if (!backdropEl) {
                    backdropEl = ctx.el.querySelector('.pdx-dialog-backdrop');
                    if (backdropEl) backdropEl.onclick = (e: MouseEvent) => {
                        if (ctx.closeOnBackdrop() && e.target === backdropEl) tryClose();
                    };
                }
                if (backdropEl && panelEl) holdModalFocus(backdropEl, panelEl);
                if (isOpen) {
                    // Set size class
                    if (panelEl) {
                        panelEl.className = `pdx-dialog-panel pdx-dialog-${size}`;
                    }

                    overlayId = 'pdx-dialog-' + (++_dialogCounter);
                    const zIndex = overlayStack.push(overlayId, { modal: true });
                    if (backdropEl) backdropEl.style.zIndex = String(zIndex);

                    // Animate in next frame (tracked for cancellation)
                    _innerRafId = requestAnimationFrame(() => {
                        _innerRafId = 0;
                        if (backdropEl) backdropEl.setAttribute('data-open', '');
                        if (panelEl) {
                            trapDispose = focusTrap(panelEl, { restoreFocus: true });
                            // Focus after trap initializes (next microtask)
                            setTimeout(() => focusInitial(), 0);
                        }
                        // Hide footer if no slotted content
                        const footer = ctx.el.querySelector('.pdx-dialog-footer') as HTMLElement;
                        if (footer) {
                            const hasContent = ctx.el.querySelector('[slot="footer"]');
                            footer.style.display = hasContent ? '' : 'none';
                        }
                        // Scroll shadow
                        const body = ctx.el.querySelector('.pdx-dialog-body') as HTMLElement;
                        if (body) scrollCleanup = setupScrollShadow(body);
                    });

                    if (ctx.closeOnEscape()) {
                        dismissDispose = overlayStack.onDismissTop(() => tryClose());
                    }
                } else {
                    // Close
                    if (backdropEl) backdropEl.removeAttribute('data-open');
                    if (trapDispose) { trapDispose(); trapDispose = null; }
                    if (dismissDispose) { dismissDispose(); dismissDispose = null; }
                    if (scrollCleanup) { scrollCleanup(); scrollCleanup = null; }
                    if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                }
            });

            return () => {
                if (trapDispose) { trapDispose(); trapDispose = null; }
                if (dismissDispose) { dismissDispose(); dismissDispose = null; }
                if (scrollCleanup) { scrollCleanup(); scrollCleanup = null; }
                if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
            };
        });

        // Imperative API: el.show() / el.close() / el.toggle() / el.isOpen.
        // `show` (not `open`) to avoid shadowing the boolean `open` prop — mirrors native <dialog>.
        ctx.expose({
            show() { (ctx.el as any).open = true; },
            // The author asking, so it is not blocked by prevent-close (see tryClose).
            close: () => tryClose(false),
            toggle() { if (ctx.open()) tryClose(false); else (ctx.el as any).open = true; },
            get isOpen() { return ctx.open() as boolean; },
        });

        return { tryClose };
    },
    render: (ctx) => html`
        <div class="pdx-dialog-backdrop">
            <div class="pdx-dialog-panel pdx-dialog-${ctx.size}" role="dialog" aria-modal="true"
                :aria-label="${() => ctx.title() || uiString('dialog', 'label')}">
                <div class="pdx-dialog-header">
                    <span>${ctx.title}</span>
                    ${() => ctx.showClose() ? html`
                        <button type="button" class="pdx-dialog-close" :aria-label="${() => uiString('dialog', 'close')}">\u2715</button>
                    ` : ''}
                </div>
                <div class="pdx-dialog-body">
                    <slot></slot>
                </div>
                <div class="pdx-dialog-footer">
                    <slot name="footer"></slot>
                </div>
            </div>
        </div>
    `,
});
