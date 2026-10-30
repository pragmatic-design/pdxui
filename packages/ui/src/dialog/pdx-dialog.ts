// pdx-dialog — Modal dialog with backdrop, focus trap, Escape close.
// Uses overlayStack for z-index management and Escape coordination.
// Same pattern as pdx-drawer: backdrop + panel in render template, CSS visibility.

import { component, event, html, model } from '@pdxui/core';
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
 */
component('pdx-dialog', {
    // `open` is a model (#288): the dialog closes itself — Escape, the backdrop, its close button — and
    // its own writes announce `open-change` `{ value }`, which `::open` follows. It replaced `pdx-close`.
    models: { open: model<boolean>(false, { type: Boolean }) },
    // On the host as custom states (#132, #288): the design CSS draws the backdrop and the body's scroll
    // shadows from them, and neither carries an attribute or a class for it.
    states: ['open', 'loading', 'scroll-top', 'scroll-bottom'],
    parts: ['root', 'backdrop', 'header', 'close', 'body', 'footer'],
    // The axis dialog.css keys by (#633), reflected on the host and drawn on the panel, the root part;
    // each value maps the class that draws the same panel elsewhere (pdx-alert-dialog, the overlay
    // outlet, native markup).
    variants: {
        /** sm, md (the default), lg, xl or full. */
        size: { md: '.pdx-dialog-md', sm: '.pdx-dialog-sm', lg: '.pdx-dialog-lg', xl: '.pdx-dialog-xl', full: '.pdx-dialog-full' },
    },
    props: {
        title: { type: String, default: '' },
        closeOnBackdrop: { type: Boolean, default: true },
        closeOnEscape: { type: Boolean, default: true },
        showClose: { type: Boolean, default: true },
        initialfocus: { type: String, default: '' },
        preventClose: { type: Boolean, default: false },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    events: {
        /** Fired (cancelable) before closing; call preventDefault() to block it. */
        'pdx-before-close': event<void>(),
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
            // Always emit cancelable before-close — consumer decides whether to block. It stays on the
            // dialog, as no undeclared event bubbles (#138).
            if (!ctx.emit('pdx-before-close', undefined, { cancelable: true })) return;
            if (byUser && ctx.preventClose() as boolean) return;
            ctx.open.set(false);
        }

        function setupScrollShadow(el: HTMLElement) {
            function update() {
                const { scrollTop, scrollHeight, clientHeight } = el;
                ctx.state('scroll-top', scrollTop > 4);
                ctx.state('scroll-bottom', scrollTop + clientHeight < scrollHeight - 4);
            }
            el.addEventListener('scroll', update, { passive: true });
            requestAnimationFrame(update);
            return () => {
                el.removeEventListener('scroll', update);
                ctx.state('scroll-top', false);
                ctx.state('scroll-bottom', false);
            };
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
            // The panel says it is busy (A4), in the template.
            ctx.state('loading', !!ctx.loading());

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
                // panelEl/backdropEl null forever so the open state is never set and the dialog never opens.
                if (!panelEl) panelEl = ctx.el.querySelector('.pdx-dialog-panel');
                if (!backdropEl) {
                    backdropEl = ctx.el.querySelector('.pdx-dialog-backdrop');
                    if (backdropEl) backdropEl.onclick = (e: MouseEvent) => {
                        if (ctx.closeOnBackdrop() && e.target === backdropEl) tryClose();
                    };
                }
                if (backdropEl && panelEl) holdModalFocus(backdropEl, panelEl);
                if (isOpen) {
                    overlayId = 'pdx-dialog-' + (++_dialogCounter);
                    const zIndex = overlayStack.push(overlayId, { modal: true });
                    if (backdropEl) backdropEl.style.zIndex = String(zIndex);

                    // Animate in next frame (tracked for cancellation)
                    _innerRafId = requestAnimationFrame(() => {
                        _innerRafId = 0;
                        // A frame after the backdrop is placed, so the design CSS animates it in.
                        ctx.state('open', true);
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
                    ctx.state('open', false);
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
        // Each writes the model, so each announces `open-change`.
        ctx.expose({
            show() { ctx.open.set(true); },
            // The author asking, so it is not blocked by prevent-close (see tryClose).
            close: () => tryClose(false),
            toggle() { if (ctx.open()) tryClose(false); else ctx.open.set(true); },
            get isOpen() { return ctx.open() as boolean; },
        });

        return { tryClose };
    },
    render: (ctx) => html`
        <div class="pdx-dialog-backdrop" data-part="backdrop">
            <div class="pdx-dialog-panel" data-part="root" role="dialog" aria-modal="true"
                :aria-label="${() => ctx.title() || uiString('dialog', 'label')}"
                :aria-busy="${() => ctx.loading() ? 'true' : null}">
                <div class="pdx-dialog-header" data-part="header">
                    <span>${ctx.title}</span>
                    ${() => ctx.showClose() ? html`
                        <button type="button" class="pdx-dialog-close" data-part="close" :aria-label="${() => uiString('dialog', 'close')}">\u2715</button>
                    ` : ''}
                </div>
                <div class="pdx-dialog-body" data-part="body">
                    <slot></slot>
                </div>
                <div class="pdx-dialog-footer" data-part="footer">
                    <slot name="footer"></slot>
                </div>
            </div>
        </div>
    `,
});
