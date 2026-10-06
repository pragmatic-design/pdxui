// pdx-affix — Makes child element sticky when scrolling past a threshold.

import { component, html, signal, DEV } from '@pdxui/core';

/**
 * Makes an element sticky once the user scrolls past a threshold, and reports when it is.
 */
component('pdx-affix', {
    props: {
        /** Offset from top when affixed (px) */
        offsetTop: { type: Number, default: 0 },
        /** Offset from bottom when affixed (px) */
        offsetBottom: { type: Number, default: -1 },
        /** Target scroll container selector (default: window) */
        target: { type: String, default: '' },
    },
    setup(ctx) {
        const _affixed = signal(false);
        let _scrollHandler: (() => void) | null = null;
        let _placeholder: HTMLElement | null = null;
        let _observer: IntersectionObserver | null = null;
        let _sentinel: HTMLElement | null = null;

        /** The affixed state, reported once per change: the class, and `pdx-change { affixed }`. */
        function setAffixed(affixed: boolean): void {
            if (affixed === _affixed.peek()) return;
            _affixed.set(affixed);
            ctx.el.classList.toggle('pdx-affix-fixed', affixed);
            ctx.emit('pdx-change', { affixed });
        }

        /**
         * Container mode reports when the sticky element is stuck. CSS sticky does the
         * sticking, and says nothing about it: on its own, `pdx-change` would never fire and
         * `pdx-affix-fixed` would never be added. A 1px sentinel sits against the element's
         * leading edge — before it for `offsetTop`, after it for `offsetBottom` — and an
         * IntersectionObserver rooted at the target, its edge moved in by the offset, sees the
         * sentinel leave: that is the moment the element starts to stick.
         *
         * The sticking is bounded by the element's parent, as CSS sticky's always is: once the parent
         * itself has scrolled away the element leaves with it, and the state still says stuck. In the
         * common case — the element a direct child of the scroll container — the two coincide.
         */
        function observeStuck(root: Element, offsetTop: number, offsetBottom: number): void {
            const atBottom = offsetBottom >= 0;
            const sentinel = document.createElement('div');
            sentinel.className = 'pdx-affix-sentinel';
            sentinel.setAttribute('aria-hidden', 'true');
            // One pixel high, taking no space: its far edge touches the element's leading edge.
            sentinel.style.cssText = `height:1px;${atBottom ? 'margin-bottom' : 'margin-top'}:-1px;visibility:hidden;pointer-events:none`;
            if (atBottom) ctx.el.after(sentinel);
            else ctx.el.before(sentinel);
            _sentinel = sentinel;
            _observer = new IntersectionObserver(([entry]) => {
                const bounds = entry.rootBounds;
                if (!bounds) return;
                const past = atBottom
                    ? entry.boundingClientRect.top >= bounds.bottom
                    : entry.boundingClientRect.bottom <= bounds.top;
                setAffixed(!entry.isIntersecting && past);
            }, {
                root,
                rootMargin: atBottom ? `0px 0px -${offsetBottom}px 0px` : `-${offsetTop}px 0px 0px 0px`,
                threshold: 0,
            });
            _observer.observe(sentinel);
        }

        ctx.track(() => {
            const offsetTop = ctx.offsetTop() as number;
            const offsetBottom = ctx.offsetBottom() as number;
            const targetSelector = ctx.target() as string;

            requestAnimationFrame(() => {
                ctx.el.classList.add('pdx-affix-root');
                // Host must be block-level: a custom element defaults to display:inline,
                // but position:sticky/fixed require a block box to reserve space and honor top/bottom.
                if (!ctx.el.style.display) ctx.el.style.display = 'block';

                // Inside a scroll container: CSS sticky sticks, and an observer rooted at the target
                // reports it. The selector is queried, not only a mode switch.
                if (targetSelector) {
                    ctx.el.style.position = 'sticky';
                    ctx.el.style.zIndex = '10';
                    if (offsetBottom >= 0) {
                        ctx.el.style.bottom = offsetBottom + 'px';
                    } else {
                        ctx.el.style.top = offsetTop + 'px';
                    }
                    const root = document.querySelector(targetSelector);
                    if (root) observeStuck(root, offsetTop, offsetBottom);
                    else if (DEV) console.warn(`[pdx-affix] target "${targetSelector}" matches no element: the affix sticks to its nearest scroll container, and cannot report when it is stuck.`);
                    return;
                }

                // Window-level: use scroll listener + fixed positioning
                if (_scrollHandler) {
                    window.removeEventListener('scroll', _scrollHandler);
                }

                let _affixRaf = 0;
                _scrollHandler = () => {
                    // A gBCR on every scroll event without a throttle = layout thrash
                    if (_affixRaf) return;
                    _affixRaf = requestAnimationFrame(() => { _affixRaf = 0; _measureAffix(); });
                };
                const _measureAffix = () => {
                    const el = ctx.el;
                    const rect = (_placeholder || el).getBoundingClientRect();

                    let shouldAffix = false;
                    if (offsetBottom >= 0) {
                        shouldAffix = rect.bottom > window.innerHeight - offsetBottom;
                    } else {
                        shouldAffix = rect.top <= offsetTop;
                    }

                    if (shouldAffix && !_affixed.peek()) {
                        _affixed.set(true);
                        if (!_placeholder) {
                            _placeholder = document.createElement('div');
                            _placeholder.style.width = el.offsetWidth + 'px';
                            _placeholder.style.height = el.offsetHeight + 'px';
                            el.parentNode?.insertBefore(_placeholder, el);
                        }
                        el.classList.add('pdx-affix-fixed');
                        el.style.position = 'fixed';
                        if (offsetBottom >= 0) {
                            el.style.bottom = offsetBottom + 'px';
                            el.style.top = '';
                        } else {
                            el.style.top = offsetTop + 'px';
                            el.style.bottom = '';
                        }
                        ctx.emit('pdx-change', { affixed: true });
                    } else if (!shouldAffix && _affixed.peek()) {
                        _affixed.set(false);
                        el.classList.remove('pdx-affix-fixed');
                        el.style.position = '';
                        el.style.top = '';
                        el.style.bottom = '';
                        if (_placeholder) {
                            _placeholder.remove();
                            _placeholder = null;
                        }
                        ctx.emit('pdx-change', { affixed: false });
                    }
                };

                window.addEventListener('scroll', _scrollHandler, { passive: true });
            });

            return () => {
                if (_scrollHandler) {
                    window.removeEventListener('scroll', _scrollHandler);
                    _scrollHandler = null;
                }
                if (_placeholder) { _placeholder.remove(); _placeholder = null; }
                if (_observer) { _observer.disconnect(); _observer = null; }
                if (_sentinel) { _sentinel.remove(); _sentinel = null; }
            };
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
