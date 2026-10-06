// pdx-drawer — Slide-in panel from any edge.
// Uses overlayStack for z-index, focusTrap for keyboard, swipe-to-close on mobile.
// Positions: left/right/top/bottom. Modes: overlay/push. Sizes: sm/md/lg/custom.
// CSS classes from @pdxui/design (drawer.css). Resizable via drag handle.

import { component, html } from '@pdxui/core';
import { overlayStack, focusTrap } from '@pdxui/core';
import type { Dispose } from '@pdxui/core';
import { uiString } from '../shared/i18n';
import { holdModalFocus } from '../shared/modal-focus';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/drawer';
// Its ✕ is a `.pdx-dialog-close`, drawn by dialog.css — 24×28.8 instead of 32×32 without it.
import '@pdxui/design/components/dialog';

let _drawerCounter = 0;

/**
 * A panel that slides in from any edge, over the page or pushing it, with swipe-to-close and a focus
 * trap.
 *
 * @slot header - Title area at the top of the panel, beside the close button.
 * @slot footer - Action area at the bottom of the panel (e.g. Save / Cancel).
 */
component('pdx-drawer', {
    props: {
        open: { type: Boolean, default: false },
        /** Position: left, right (default), top, bottom */
        position: { type: String, default: 'right', enum: ['left', 'right', 'top', 'bottom'] },
        /** Size: sm (280px), md (380px), lg (520px), or ANY custom CSS width (e.g. "640px").
         *  Open-ended on purpose → NOT declared as a closed enum. */
        size: { type: String, default: 'md' },
        /** Mode: overlay (default) or push (shifts page content) */
        mode: { type: String, default: 'overlay', enum: ['overlay', 'push'] },
        /** Close on backdrop click */
        closeOnBackdrop: { type: Boolean, default: true },
        /** Close on Escape */
        closeOnEscape: { type: Boolean, default: true },
        /** Show close button in header */
        showClose: { type: Boolean, default: true },
        /** Show resize handle on edge */
        resizable: { type: Boolean, default: false },
        /** Label for screen readers */
        label: { type: String, default: '' },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    setup(ctx) {
        let trapDispose: Dispose | null = null;
        let dismissDispose: Dispose | null = null;
        let overlayId = '';
        let backdropEl: HTMLElement | null = null;
        let drawerEl: HTMLElement | null = null;
        let _rafId = 0;
        let portaled = false;
        let restoreTimer = 0;

        // A position:fixed panel only needs to escape to <body> when some ANCESTOR establishes a containing
        // block / stacking context that would trap it (transform/filter/perspective/contain/will-change).
        // When nothing traps it (the common case) portaling is pure downside: it detaches the slotted content
        // from its scoped-style ancestor (styles stop matching) AND reconnects child components (pdx-button
        // double-renders, pdx-select loses imperatively-set props). So portal ONLY when actually needed.
        function needsPortal(): boolean {
            let el: HTMLElement | null = ctx.el.parentElement;
            while (el && el !== document.documentElement && el !== document.body) {
                const cs = getComputedStyle(el);
                if (cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none'
                    || cs.willChange.includes('transform') || cs.contain.includes('paint') || cs.contain.includes('layout')) {
                    return true;
                }
                el = el.parentElement;
            }
            return false;
        }
        // Move the overlay to <body> so its z-index escapes a trapping stacking context (a drawer opened from
        // deep in a positioned/transformed layout would otherwise sit UNDER siblings — uncovered + click-blocked).
        // Overlay mode only; push mode shifts page flow.
        function portalToBody(): void {
            if (portaled || !backdropEl || !drawerEl) return;
            if (!needsPortal()) return;   // nothing traps fixed positioning → keep in place (preserve scope + children)
            document.body.appendChild(backdropEl);
            document.body.appendChild(drawerEl);
            portaled = true;
        }
        function restorePortal(): void {
            if (!portaled || !backdropEl || !drawerEl) return;
            ctx.el.appendChild(backdropEl);
            ctx.el.appendChild(drawerEl);
            portaled = false;
        }

        /**
         * The drawer closing ITSELF — Escape, the ✕, the backdrop, a swipe.
         *
         * It asks first, and a host that says no keeps it open. Writing
         * `el.open = false` straight away would destroy the host's own value: a host that
         * declined — «you have unsaved changes», the thing a confirm exists for — would be left with
         * a component that had shut itself and a binding that could not put it back, because the
         * host's value never changed and a binding writes on change. The panel would keep
         * `visibility: hidden` from losing `[data-open]`, so it would be out of the accessibility
         * tree while `el.open` still read true.
         *
         * `pdx-dialog` has the same shape, and its reasoning holds here: the event
         * fires either way, because an app that wants to ask needs to know the attempt happened.
         *
         * Closing through the PROP does not come here: the host setting `open = false` IS the
         * answer, and asking would be asking it to confirm its own decision.
         */
        function close() {
            const before = new CustomEvent('pdx-before-close', { bubbles: true, cancelable: true });
            ctx.el.dispatchEvent(before);
            if (before.defaultPrevented) return;
            (ctx.el as any).open = false;
            ctx.emit('pdx-close', undefined, { bubbles: false });
        }

        /** The element focused when the drawer opened — a button, a row, a menu item. */
        let openerEl: HTMLElement | null = null;
        /**
         * Put focus back on the opener, when the user was in the drawer (Escape, the close button, a
         * Cancel inside) or nowhere (a backdrop click, focus on <body>). Focus that has already moved
         * on to something else on the page stays there.
         */
        function returnFocus(focusWasInside: boolean): void {
            const opener = openerEl;
            openerEl = null;
            if (!opener || !opener.isConnected) return;
            const active = document.activeElement;
            if (!focusWasInside && active && active !== document.body) return;
            opener.focus();
        }

        function onBackdropClick() {
            if (ctx.closeOnBackdrop()) close();
        }

        // Swipe-to-close gesture
        function setupSwipe() {
            if (!drawerEl) return;
            const pos = ctx.position() as string || 'right';
            let startX = 0, startY = 0, dragging = false;

            function onPointerDown(e: PointerEvent) {
                // Only swipe from edge area (first 20px of the drawer edge)
                const rect = drawerEl!.getBoundingClientRect();
                const edgeThreshold = 30;
                const isHorizontal = pos === 'left' || pos === 'right';
                if (isHorizontal) {
                    const edgeX = pos === 'left' ? rect.right - edgeThreshold : rect.left + edgeThreshold;
                    if (pos === 'left' && e.clientX < edgeX) return;
                    if (pos === 'right' && e.clientX > edgeX) return;
                }
                startX = e.clientX;
                startY = e.clientY;
                dragging = true;
                drawerEl!.style.transition = 'none';
            }

            function onPointerMove(e: PointerEvent) {
                if (!dragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                let translate = '';
                if (pos === 'right' && dx > 0) translate = `translateX(${dx}px)`;
                else if (pos === 'left' && dx < 0) translate = `translateX(${dx}px)`;
                else if (pos === 'bottom' && dy > 0) translate = `translateY(${dy}px)`;
                else if (pos === 'top' && dy < 0) translate = `translateY(${dy}px)`;

                if (translate) drawerEl!.style.transform = translate;
            }

            function onPointerUp(e: PointerEvent) {
                if (!dragging) return;
                dragging = false;
                drawerEl!.style.transition = '';
                drawerEl!.style.transform = '';

                const dx = Math.abs(e.clientX - startX);
                const dy = Math.abs(e.clientY - startY);
                const threshold = 100;
                const isHorizontal = pos === 'left' || pos === 'right';
                const swipeDistance = isHorizontal ? dx : dy;

                if (swipeDistance > threshold) close();
            }

            drawerEl.addEventListener('pointerdown', onPointerDown);
            drawerEl.addEventListener('pointermove', onPointerMove);
            drawerEl.addEventListener('pointerup', onPointerUp);

            return () => {
                drawerEl?.removeEventListener('pointerdown', onPointerDown);
                drawerEl?.removeEventListener('pointermove', onPointerMove);
                drawerEl?.removeEventListener('pointerup', onPointerUp);
            };
        }

        let swipeDispose: Dispose | null = null;
        let _bound = false;

        ctx.track(() => {
            const isOpen = ctx.open();
            const pos = ctx.position() as string || 'right';
            const size = ctx.size() as string || 'md';
            const mode = ctx.mode() as string || 'overlay';
            const el = ctx.el;

            if (ctx.loading()) el.setAttribute('aria-busy', 'true');
            else el.removeAttribute('aria-busy');

            if (!_bound) {
                _bound = true;
                requestAnimationFrame(() => {
                    backdropEl = el.querySelector('.pdx-drawer-backdrop');
                    drawerEl = el.querySelector('.pdx-drawer');
                    if (backdropEl) backdropEl.addEventListener('click', onBackdropClick);
                    const closeBtn = el.querySelector('.pdx-drawer-close');
                    if (closeBtn) (closeBtn as HTMLElement).onclick = close;
                });
            }

            if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
            _rafId = requestAnimationFrame(() => {
                _rafId = 0;
                // Lazy (re)resolve: the once-on-mount capture above runs in a rAF and can miss the panel if the
                // render hasn't painted it yet (render timing in a real browser differs from jsdom) — leaving
                // drawerEl/backdropEl null FOREVER so data-open is never set and the drawer never opens.
                if (!drawerEl) drawerEl = el.querySelector('.pdx-drawer');
                if (!backdropEl) {
                    backdropEl = el.querySelector('.pdx-drawer-backdrop');
                    if (backdropEl) backdropEl.addEventListener('click', onBackdropClick);
                }
                if (isOpen) {
                    // 1. Disable transitions while repositioning
                    if (drawerEl) {
                        drawerEl.style.transition = 'none';
                        drawerEl.setAttribute('position', pos);
                        if (['sm', 'md', 'lg'].includes(size)) {
                            drawerEl.setAttribute('size', size);
                            drawerEl.style.removeProperty('--pdx-drawer-width');
                        } else {
                            drawerEl.removeAttribute('size');
                            drawerEl.style.setProperty('--pdx-drawer-width', size);
                        }
                        if (mode === 'push') drawerEl.setAttribute('push', '');
                        else drawerEl.removeAttribute('push');
                    }

                    if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = 0; }
                    if (mode === 'overlay') portalToBody();

                    // Remember the opener, then blur it BEFORE the modal marks the background
                    // aria-hidden — otherwise the trigger stays focused inside a hidden subtree (AT users
                    // stranded). Focus moves into the drawer in the open rAF below, and back to the opener
                    // on close. The trap below cannot do that part: it records the focus it finds, which
                    // after this blur is <body>.
                    const active = document.activeElement;
                    if (active instanceof HTMLElement && active !== document.body && !drawerEl?.contains(active)) {
                        openerEl = active;
                    }
                    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

                    overlayId = 'pdx-drawer-' + (++_drawerCounter);
                    const zIndex = overlayStack.push(overlayId, { modal: true });
                    if (backdropEl) backdropEl.style.zIndex = String(zIndex - 1);
                    if (drawerEl) drawerEl.style.zIndex = String(zIndex);

                    // 2. Next frame: re-enable transitions and open
                    requestAnimationFrame(() => {
                        if (drawerEl) drawerEl.style.transition = '';
                        if (backdropEl) backdropEl.setAttribute('data-open', '');
                        if (drawerEl) drawerEl.setAttribute('data-open', '');
                        // Move focus INTO the drawer so the (now aria-hidden) background trigger doesn't
                        // retain focus — otherwise AT users are stranded on a hidden element. Focus the PANEL
                        // itself (tabindex=-1), NOT the first focusable: focusing the close button would paint a
                        // keyboard-focus ring on the X as if the user had tabbed to it. The focus trap handles Tab.
                        if (drawerEl) {
                            drawerEl.setAttribute('tabindex', '-1');
                            drawerEl.focus();
                        }
                    });

                    // Focus trap. The drawer restores focus itself (returnFocus), to the opener recorded
                    // above: the trap's own record would be <body>.
                    if (drawerEl) {
                        trapDispose = focusTrap(drawerEl, { restoreFocus: false });
                        // A mousedown on the backdrop would move focus to the page before the click closed
                        // the drawer; pdx-dialog holds focus the same way.
                        if (backdropEl) holdModalFocus(backdropEl, drawerEl);
                    }

                    // Escape via overlay stack
                    if (ctx.closeOnEscape()) {
                        dismissDispose = overlayStack.onDismissTop(close);
                    }

                    // Swipe gesture
                    swipeDispose = setupSwipe() || null;
                } else {
                    // Close drawer
                    const focusWasInside = !!drawerEl && drawerEl.contains(document.activeElement);
                    if (backdropEl) backdropEl.removeAttribute('data-open');
                    if (drawerEl) {
                        drawerEl.removeAttribute('data-open');
                        drawerEl.style.transform = '';
                    }
                    if (trapDispose) { trapDispose(); trapDispose = null; }
                    returnFocus(focusWasInside);
                    if (dismissDispose) { dismissDispose(); dismissDispose = null; }
                    if (swipeDispose) { swipeDispose(); swipeDispose = null; }
                    if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                    // Restore the overlay to the host AFTER the exit transition (don't interrupt it).
                    if (portaled) { restoreTimer = window.setTimeout(restorePortal, 260); }
                }
            });

            return () => {
                if (trapDispose) { trapDispose(); trapDispose = null; }
                if (dismissDispose) { dismissDispose(); dismissDispose = null; }
                if (swipeDispose) { swipeDispose(); swipeDispose = null; }
                if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = 0; }
                restorePortal();
            };
        });

        // Imperative API: el.show() / el.close() / el.toggle() / el.isOpen (`show` avoids the `open` prop).
        ctx.expose({
            show() { (ctx.el as any).open = true; },
            close,
            toggle() { if (ctx.open()) close(); else (ctx.el as any).open = true; },
            get isOpen() { return ctx.open() as boolean; },
        });

        return { close };
    },
    render: (ctx) => html`
        <div class="pdx-drawer-backdrop"></div>
        <div class="pdx-drawer" role="dialog" aria-modal="true"
            :aria-label="${() => ctx.label() || uiString('drawer', 'label')}">
            <div class="pdx-drawer-header">
                <slot name="header"><span></span></slot>
                ${() => ctx.showClose() ? html`
                    <button class="pdx-drawer-close pdx-dialog-close" type="button" :aria-label="${() => uiString('drawer', 'close')}">\u2715</button>
                ` : ''}
            </div>
            <div class="pdx-drawer-body">
                <slot></slot>
            </div>
            <div class="pdx-drawer-footer">
                <slot name="footer"></slot>
            </div>
            ${() => ctx.resizable() ? html`<div class="pdx-drawer-resize"></div>` : ''}
        </div>
    `,
});
