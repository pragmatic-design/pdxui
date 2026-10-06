// pdx-block-ui — Loading overlay that blocks interaction on a container.
// Wraps content. When `blocked`, shows a semi-transparent overlay with spinner.
// Used by data-bound components (List, Table, DataGrid) during loading.
//
// Blocking and drawing are two different moments: the input is
// blocked the moment `blocked` turns on — `inert`, `aria-busy` — and the overlay is DRAWN only after
// `delay` ms, then kept for at least `min-duration` ms. A 40 ms save does not flash a spinner, and
// one that ends 20 ms after appearing does not blink. `fullscreen` covers the viewport and makes the
// rest of the document inert, which the libraries that have a full-screen mode do not.

import { component, html, onDestroy } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/block-ui';
import '../spinner/pdx-spinner'; // rendered by this component, and registered by nobody else

/**
 * A loading overlay that wraps content and, while blocked, stops interaction with it and covers it
 * with a semi-transparent overlay and a spinner.
 */
component('pdx-block-ui', {
    props: {
        /** Whether the UI is blocked (shows overlay + spinner) */
        blocked: { type: Boolean, default: false },
        /** Custom message shown below spinner */
        message: { type: String, default: '' },
        /** Spinner variant: spinner (default), skeleton, none */
        variant: { type: String, default: 'spinner' },
        /** Cover the viewport, not the element, and make the rest of the document inert. */
        fullscreen: { type: Boolean, default: false },
        /** Ms before the overlay is drawn. The input is blocked from the start either way. */
        delay: { type: Number, default: 300 },
        /** Ms the overlay stays drawn once it is, however soon the block ends. */
        minDuration: { type: Number, default: 200 },
    },
    // Emits `pdx-block` when the overlay is DRAWN (past its delay) and `pdx-unblock` when it is taken
    // away: the moments a person sees, not the moments `blocked` changed.
    setup(ctx) {
        let _built = false;
        let _overlayEl: HTMLElement | null = null;
        // The live region. Built always, whatever `message` is at first: a message bound to a
        // value that arrives later needs an element to go into.
        let _msgEl: HTMLElement | null = null;
        let _wasShown = false;
        /** Drawn — past its delay — and since when. */
        let _shown = false;
        let _shownAt = 0;
        let _showTimer: ReturnType<typeof setTimeout> | null = null;
        let _hideTimer: ReturnType<typeof setTimeout> | null = null;
        /** What a fullscreen block made inert outside itself, to give back exactly that. */
        let _inertOutside: Element[] = [];

        /**
         * The region's text follows the DRAWN overlay. A live region announces a CHANGE of its
         * content: text written once at build while only aria-hidden flips is never announced.
         * So: empty while hidden; on showing, empty now and the message in the
         * next frame, when the overlay is already exposed.
         */
        function syncMessage(shown: boolean, message: string): void {
            if (!_msgEl) return;
            if (!shown) { _msgEl.textContent = ''; _wasShown = false; return; }
            if (_wasShown) { _msgEl.textContent = message; return; } // a message changed while shown
            _wasShown = true;
            _msgEl.textContent = '';
            requestAnimationFrame(() => {
                if (_msgEl && _shown) _msgEl.textContent = ctx.message() as string;
            });
        }

        /**
         * The overlay stops the mouse; `inert` stops the keyboard and the screen reader, or Tab would
         * reach a control under the overlay and Enter would run it. Every child but the overlay, whose
         * status message must still be read.
         */
        function syncInert(blocked: boolean): void {
            for (const child of Array.from(ctx.el.children)) {
                if (child !== _overlayEl) child.toggleAttribute('inert', blocked);
            }
        }

        /**
         * Fullscreen: every element beside the path from the host up to <body>, made inert — the
         * header, the rail, the rest of the page. Only what was not inert already, so the release
         * gives back exactly what the block took.
         */
        function inertOutside(on: boolean): void {
            if (!on) {
                for (const el of _inertOutside) el.removeAttribute('inert');
                _inertOutside = [];
                return;
            }
            if (_inertOutside.length > 0) return;
            for (let node: Element | null = ctx.el; node && node !== document.body; node = node.parentElement) {
                const parent: HTMLElement | null = node.parentElement;
                if (!parent) break;
                for (const sibling of Array.from<Element>(parent.children)) {
                    if (sibling === node || sibling.hasAttribute('inert')) continue;
                    if (sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE') continue;
                    sibling.setAttribute('inert', '');
                    _inertOutside.push(sibling);
                }
            }
        }

        function draw(on: boolean): void {
            if (_overlayEl) {
                _overlayEl.classList.toggle('pdx-block-ui-visible', on);
                _overlayEl.setAttribute('aria-hidden', String(!on));
            }
            syncMessage(on, ctx.message() as string);
        }

        /** The input: blocked or given back, at once. */
        function block(on: boolean): void {
            ctx.el.setAttribute('aria-busy', String(on));
            syncInert(on);
            inertOutside(on && (ctx.fullscreen() as boolean));
        }

        function show(): void {
            _showTimer = null;
            if (!ctx.blocked()) return;
            _shown = true;
            _shownAt = performance.now();
            draw(true);
            ctx.emit('pdx-block');
        }

        function hide(): void {
            _hideTimer = null;
            if (ctx.blocked()) return; // blocked again while it was held: stays
            _shown = false;
            draw(false);
            block(false);
            ctx.emit('pdx-unblock');
        }

        function apply(blocked: boolean): void {
            if (blocked) {
                if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
                block(true);
                if (_shown) { draw(true); return; }
                if (_showTimer) return;
                const wait = Math.max(0, Number(ctx.delay()) || 0);
                if (wait === 0) show(); else _showTimer = setTimeout(show, wait);
                return;
            }
            if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
            if (!_shown) { block(false); return; } // never drawn: nothing to take away
            if (_hideTimer) return;
            const left = (Math.max(0, Number(ctx.minDuration()) || 0)) - (performance.now() - _shownAt);
            if (left > 0) _hideTimer = setTimeout(hide, left); else hide();
        }

        ctx.track(() => {
            const blocked = ctx.blocked() as boolean;
            ctx.message();
            ctx.fullscreen();
            const variant = ctx.variant() as string;

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-block-ui');

                    _overlayEl = document.createElement('div');
                    _overlayEl.className = 'pdx-block-ui-overlay';
                    _overlayEl.setAttribute('aria-hidden', 'true');

                    const spinnerWrap = document.createElement('div');
                    spinnerWrap.className = 'pdx-block-ui-spinner';

                    if (variant !== 'none') {
                        const spinner = document.createElement('pdx-spinner');
                        spinner.setAttribute('size', 'md');
                        // Decorative HERE: the overlay already has a live region, the message
                        // below, and pdx-spinner carries its own role="status" with a "Loading"
                        // label. Two live regions in one overlay is what the block announces
                        // twice, and the invariant this component's own test states is ONE.
                        spinner.setAttribute('aria-hidden', 'true');
                        spinnerWrap.appendChild(spinner);
                    }

                    // Live region: the screen reader announces the loading state.
                    _msgEl = document.createElement('span');
                    _msgEl.className = 'pdx-block-ui-message';
                    _msgEl.setAttribute('role', 'status');
                    _msgEl.setAttribute('aria-live', 'polite');
                    spinnerWrap.appendChild(_msgEl);

                    _overlayEl.appendChild(spinnerWrap);
                    _overlayEl.classList.toggle('pdx-block-ui-fullscreen', ctx.fullscreen() as boolean);
                    ctx.el.appendChild(_overlayEl);
                    ctx.el.setAttribute('aria-busy', 'false');
                    apply(ctx.blocked() as boolean);
                });
                return;
            }
            if (!_overlayEl) return; // still building: the frame above applies the current state
            _overlayEl.classList.toggle('pdx-block-ui-fullscreen', ctx.fullscreen() as boolean);
            apply(blocked);
        });

        // The overlay is appended to the host, next to the author's children, and core counts what
        // arrives there after mount as authored: left in place, a move would put it back as a child
        // and the next mount would build a second one beside it.
        onDestroy(() => {
            if (_showTimer) clearTimeout(_showTimer);
            if (_hideTimer) clearTimeout(_hideTimer);
            syncInert(false);
            inertOutside(false);
            _overlayEl?.remove(); _overlayEl = null; _msgEl = null;
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
