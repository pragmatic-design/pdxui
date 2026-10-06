// pdx-bottom-sheet — Draggable sheet from bottom with detent snap points.
// Uses overlayStack for z-index + Escape, focusTrap for keyboard, drag for gesture.
// Detents: array of fractions (0-1) of viewport height. Default: [0.4, 0.85].
// CSS from @pdxui/design (bottom-sheet.css).

import { component, html, signal } from '@pdxui/core';
import { overlayStack, focusTrap } from '@pdxui/core';
import type { Dispose } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/bottom-sheet';
// Its ✕ is a `.pdx-dialog-close`, drawn by dialog.css.
import '@pdxui/design/components/dialog';

let _sheetCounter = 0;

/**
 * A sheet that rises from the bottom edge and snaps to set heights: the user drags its handle to
 * resize it and swipes down to dismiss it.
 *
 * @slot header - Content of the sheet's header, above the body.
 * @slot footer - Content at the bottom of the sheet, below the body (e.g. actions).
 */
component('pdx-bottom-sheet', {
    props: {
        open: { type: Boolean, default: false },
        /** Snap points as fractions of viewport height (0-1). Default: [0.4, 0.85] */
        detents: { type: Array, default: () => [0.4, 0.85] },
        /** Initial detent index. Default: 0 (smallest) */
        initialDetent: { type: Number, default: 0 },
        /** Show the backdrop. With `false` nothing behind the sheet is dimmed, and no backdrop click closes it. */
        backdrop: { type: Boolean, default: true },
        /** Close on backdrop click. Default: true */
        closeOnBackdrop: { type: Boolean, default: true },
        /** Close on Escape. Default: true */
        closeOnEscape: { type: Boolean, default: true },
        /** Close on swipe down below minimum detent. Default: true */
        closeOnSwipeDown: { type: Boolean, default: true },
        /** Show drag handle bar. Default: true */
        showHandle: { type: Boolean, default: true },
        /** Show close button. Default: false */
        showClose: { type: Boolean, default: false },
        /** Label for accessibility. */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        let trapDispose: Dispose | null = null;
        let dismissDispose: Dispose | null = null;
        let overlayId = '';
        let backdropEl: HTMLElement | null = null;
        let sheetEl: HTMLElement | null = null;
        let handleEl: HTMLElement | null = null;
        let bodyEl: HTMLElement | null = null;
        let _bound = false;
        let _rafId = 0;
        let _innerRafId = 0;

        // Drag state
        let startY = 0;
        let startHeight = 0;
        let isDragging = false;
        let currentHeight = 0;
        /** The detent the sheet rests at — what the handle, a slider, reports and moves. */
        const currentDetent = signal(0);

        const VELOCITY_THRESHOLD = 400; // px/s to trigger quick snap/dismiss
        /**
         * The release velocity is measured over the last 100 ms of movement, not the step between the
         * last pointermove and the pointerup, which arrive at the same position for mouse and touch:
         * that is about 0, and a fast swipe would never dismiss. Times are the events' own `timeStamp`,
         * when the input happened: the time the handler runs adds main-thread delay, and a busy page
         * would read a fast swipe as a slow one.
         */
        const VELOCITY_WINDOW_MS = 100;
        let samples: { y: number; t: number }[] = [];

        function sample(y: number, t: number): void {
            samples.push({ y, t });
            while (samples.length > 1 && t - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
        }

        /** px/s over the window, positive downward (the closing direction); 0 after a pause. */
        function releaseVelocity(y: number, t: number): number {
            sample(y, t);
            const now = samples[samples.length - 1].t;
            const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
            const first = recent[0], last = recent[recent.length - 1];
            const dt = (last.t - first.t) / 1000;
            return dt > 0 ? (last.y - first.y) / dt : 0;
        }

        function getDetents(): number[] {
            const d = ctx.detents() as number[];
            return (d && d.length > 0) ? d.slice().sort((a, b) => a - b) : [0.4, 0.85];
        }

        function getVh(): number {
            return window.innerHeight;
        }

        function tryClose() {
            const event = new CustomEvent('pdx-before-close', {
                bubbles: true, cancelable: true,
            });
            ctx.el.dispatchEvent(event);
            if (event.defaultPrevented) return;
            doClose();
        }

        function doClose() {
            (ctx.el as any).open = false;
            ctx.emit('pdx-close', undefined, { bubbles: false });
        }

        function applyHeight(h: number, animate: boolean) {
            currentHeight = h;
            if (!sheetEl) return;
            const maxH = getVh() * 0.95;
            const clamped = Math.max(0, Math.min(h, maxH));
            sheetEl.style.height = `${clamped}px`;
            if (animate) {
                sheetEl.removeAttribute('data-dragging');
            } else {
                sheetEl.setAttribute('data-dragging', '');
            }
            // Sync backdrop opacity with sheet position
            if (backdropEl) {
                const detents = getDetents();
                const ratio = clamped / getVh();
                const opacity = Math.min(1, ratio / (detents[0] || 0.4));
                backdropEl.style.opacity = String(opacity);
            }
        }

        function snapTo(detentIndex: number) {
            const detents = getDetents();
            const idx = Math.max(0, Math.min(detentIndex, detents.length - 1));
            const h = detents[idx] * getVh();
            applyHeight(h, true);
            currentDetent.set(idx);
            ctx.emit('pdx-detent-change', { detent: detents[idx], index: idx });
        }

        /**
         * The handle is a slider over the detents: ArrowUp/Right raise the sheet a detent, ArrowDown/Left
         * lower it, Home/End go to the ends; Escape closes, through the overlay stack. Its role, tab stop
         * and name keep the detents from being pointer-only.
         */
        function onHandleKey(e: KeyboardEvent): void {
            const last = getDetents().length - 1;
            const idx = currentDetent();
            const next = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? idx + 1
                : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? idx - 1
                    : e.key === 'Home' ? 0
                        : e.key === 'End' ? last
                            : null;
            if (next === null) return;
            e.preventDefault();
            snapTo(Math.max(0, Math.min(next, last)));
        }

        function snapToNearest(h: number, velocity: number) {
            const detents = getDetents();
            const vh = getVh();
            const ratio = h / vh;

            // Fast swipe down below minimum → close
            if (ctx.closeOnSwipeDown() && velocity > VELOCITY_THRESHOLD && ratio < detents[0]) {
                animateOut();
                return;
            }

            // Fast swipe down from any detent → snap to lower or close
            if (velocity > VELOCITY_THRESHOLD) {
                for (let i = detents.length - 1; i >= 0; i--) {
                    if (detents[i] < ratio + 0.05) {
                        if (i === 0 && velocity > VELOCITY_THRESHOLD * 1.5 && ctx.closeOnSwipeDown()) {
                            animateOut();
                            return;
                        }
                        snapTo(i);
                        return;
                    }
                }
            }

            // Fast swipe up → snap to higher
            if (velocity < -VELOCITY_THRESHOLD) {
                for (let i = 0; i < detents.length; i++) {
                    if (detents[i] > ratio - 0.05) {
                        snapTo(i);
                        return;
                    }
                }
                snapTo(detents.length - 1);
                return;
            }

            // Slow release below half the smallest detent → close: a slow drag to the bottom dismisses,
            // rather than snapping back to the smallest detent.
            if (ctx.closeOnSwipeDown() && ratio < detents[0] * 0.5) {
                animateOut();
                return;
            }

            // Slow release → snap to closest
            let closestIdx = 0;
            let closestDist = Infinity;
            for (let i = 0; i < detents.length; i++) {
                const dist = Math.abs(detents[i] - ratio);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestIdx = i;
                }
            }
            snapTo(closestIdx);
        }

        function animateOut() {
            if (sheetEl) {
                sheetEl.removeAttribute('data-dragging');
                sheetEl.style.height = '0px';
            }
            // Wait for animation then actually close
            setTimeout(() => doClose(), 300);
        }

        // ─── Drag Handlers ───

        function isScrolledToTop(): boolean {
            if (!bodyEl) return true;
            return bodyEl.scrollTop <= 0;
        }

        function onPointerDown(e: PointerEvent) {
            // Drag from handle always, or from body only when scrolled to top
            const target = e.target as HTMLElement;
            const isHandle = handleEl?.contains(target);
            const isBody = bodyEl?.contains(target);

            if (!isHandle && isBody && !isScrolledToTop()) return;
            if (!isHandle && !isBody) return;

            e.preventDefault();
            isDragging = true;
            startY = e.clientY;
            startHeight = currentHeight;
            samples = [];
            sample(e.clientY, e.timeStamp);

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        }

        function onPointerMove(e: PointerEvent) {
            if (!isDragging) return;
            const dy = startY - e.clientY; // positive = drag up = increase height
            const newHeight = Math.max(0, startHeight + dy);

            // Rubber-band effect when exceeding max detent
            const detents = getDetents();
            const maxHeight = detents[detents.length - 1] * getVh();
            if (newHeight > maxHeight) {
                const excess = newHeight - maxHeight;
                applyHeight(maxHeight + excess * 0.3, false);
            } else {
                applyHeight(newHeight, false);
            }

            sample(e.clientY, e.timeStamp);
        }

        function onPointerUp(e: PointerEvent) {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);

            if (!isDragging) return;
            isDragging = false;

            snapToNearest(currentHeight, releaseVelocity(e.clientY, e.timeStamp));
        }

        // ─── Lifecycle ───

        ctx.track(() => {
            const isOpen = ctx.open();

            if (!_bound) {
                _bound = true;
                requestAnimationFrame(() => {
                    backdropEl = ctx.el.querySelector('.pdx-bottom-sheet-backdrop');
                    sheetEl = ctx.el.querySelector('.pdx-bottom-sheet');
                    handleEl = ctx.el.querySelector('.pdx-bottom-sheet-handle');
                    bodyEl = ctx.el.querySelector('.pdx-bottom-sheet-body');

                    if (backdropEl) {
                        backdropEl.addEventListener('click', () => {
                            if (ctx.backdrop() && ctx.closeOnBackdrop()) tryClose();
                        });
                    }

                    const closeBtn = ctx.el.querySelector('.pdx-bottom-sheet-close');
                    if (closeBtn) (closeBtn as HTMLElement).onclick = tryClose;

                    // Drag on handle
                    if (handleEl) {
                        handleEl.addEventListener('pointerdown', onPointerDown);
                    }
                    // Drag on body when scrolled to top
                    if (bodyEl) {
                        bodyEl.addEventListener('pointerdown', onPointerDown);
                    }
                });
            }

            if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
            if (_innerRafId) { cancelAnimationFrame(_innerRafId); _innerRafId = 0; }

            _rafId = requestAnimationFrame(() => {
                _rafId = 0;
                // Lazy (re)resolve: the once-on-mount capture above runs in a rAF and can miss the sheet if the
                // render hasn't painted it yet (render timing in a real browser differs from jsdom) — leaving
                // sheetEl/backdropEl null forever so data-open is never set and the sheet never opens.
                if (!sheetEl) sheetEl = ctx.el.querySelector('.pdx-bottom-sheet');
                if (!backdropEl) {
                    backdropEl = ctx.el.querySelector('.pdx-bottom-sheet-backdrop');
                    if (backdropEl) backdropEl.addEventListener('click', () => { if (ctx.backdrop() && ctx.closeOnBackdrop()) tryClose(); });
                }

                if (isOpen) {
                    overlayId = 'pdx-bottom-sheet-' + (++_sheetCounter);
                    const zIndex = overlayStack.push(overlayId, { modal: true });
                    if (backdropEl) {
                        backdropEl.style.zIndex = String(zIndex - 1);
                        backdropEl.style.opacity = '0';
                    }
                    if (sheetEl) {
                        sheetEl.style.zIndex = String(zIndex);
                        sheetEl.style.height = '0px';
                    }

                    _innerRafId = requestAnimationFrame(() => {
                        _innerRafId = 0;
                        if (backdropEl) backdropEl.setAttribute('data-open', '');
                        if (sheetEl) {
                            sheetEl.setAttribute('data-open', '');
                            // Animate to initial detent
                            const idx = (ctx.initialDetent() as number) || 0;
                            snapTo(idx);
                        }

                        // Focus trap
                        if (sheetEl) {
                            trapDispose = focusTrap(sheetEl, { restoreFocus: true });
                        }

                        // Hide footer if empty
                        const footer = ctx.el.querySelector('.pdx-bottom-sheet-footer') as HTMLElement;
                        if (footer) {
                            const hasContent = ctx.el.querySelector('[slot="footer"]');
                            footer.style.display = hasContent ? '' : 'none';
                        }
                    });

                    // Escape
                    if (ctx.closeOnEscape()) {
                        dismissDispose = overlayStack.onDismissTop(tryClose);
                    }
                } else {
                    // Close
                    if (backdropEl) {
                        backdropEl.removeAttribute('data-open');
                        backdropEl.style.opacity = '';
                    }
                    if (sheetEl) {
                        sheetEl.removeAttribute('data-open');
                        sheetEl.removeAttribute('data-dragging');
                        sheetEl.style.height = '';
                    }
                    if (trapDispose) { trapDispose(); trapDispose = null; }
                    if (dismissDispose) { dismissDispose(); dismissDispose = null; }
                    if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                }
            });

            return () => {
                if (trapDispose) { trapDispose(); trapDispose = null; }
                if (dismissDispose) { dismissDispose(); dismissDispose = null; }
                if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
            };
        });

        // Imperative API: el.show() / el.close() / el.toggle() / el.isOpen + snapTo(index)
        ctx.expose({
            show() { (ctx.el as any).open = true; },
            close: tryClose,
            toggle() { if (ctx.open()) tryClose(); else (ctx.el as any).open = true; },
            get isOpen() { return ctx.open() as boolean; },
            /** Move the sheet to a detent by index, clamped to the detents declared, and emit `pdx-detent-change`. */
            snapTo,
        });

        const detentMax = () => String(getDetents().length - 1);
        const detentText = () => format(uiString('bottom-sheet', 'height'),
            { percent: Math.round((getDetents()[currentDetent()] ?? 0) * 100) });

        return { tryClose, snapTo, currentDetent, detentMax, detentText, onHandleKey };
    },
    // `backdrop="false"`: the backdrop stays in the tree, hidden, so the reference the lifecycle keeps
    // to it (z-index, opacity, data-open, its click) stays valid when the prop changes.
    render: (ctx) => html`
        <div class="pdx-bottom-sheet-backdrop" :hidden="${() => !ctx.backdrop()}"></div>
        <div class="pdx-bottom-sheet" role="dialog" aria-modal="true"
            :aria-label="${() => ctx.label() || uiString('bottom-sheet', 'label')}">
            ${() => ctx.showHandle() ? html`
                <div class="pdx-bottom-sheet-handle" role="slider" tabindex="0"
                    :aria-label="${() => uiString('bottom-sheet', 'handle')}"
                    aria-valuemin="0" :aria-valuemax="${ctx.detentMax}"
                    :aria-valuenow="${() => String(ctx.currentDetent())}"
                    :aria-valuetext="${ctx.detentText}"
                    @keydown="${ctx.onHandleKey}">
                    <div class="pdx-bottom-sheet-bar"></div>
                </div>
            ` : ''}
            <div class="pdx-bottom-sheet-header">
                <slot name="header"></slot>
                ${() => ctx.showClose() ? html`
                    <button type="button" class="pdx-bottom-sheet-close pdx-dialog-close" :aria-label="${() => uiString('bottom-sheet', 'close')}">&#x2715;</button>
                ` : ''}
            </div>
            <div class="pdx-bottom-sheet-body">
                <slot></slot>
            </div>
            <div class="pdx-bottom-sheet-footer">
                <slot name="footer"></slot>
            </div>
        </div>
    `,
});
