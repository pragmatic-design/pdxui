// pdx-scroll-area — Custom scrollbar container.
// Wraps content with overlay or inset scrollbars. Uses useScrollbar() primitive.
// Props: type (auto/always/hover/scroll/never), axis, scrollHideDelay.
// API: scrollTo, scrollBy, scrollIntoView. Events: pdx-scroll.

import { component, html } from '@pdxui/core';
import { useScrollbar } from '@pdxui/core';
import type { ScrollbarReturn } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/scroll-area';

/** A purely numeric value ("160") is not valid CSS for height/max-height → it appends px. */
function toCssLength(v: string): string {
    return /^-?\d+(\.\d+)?$/.test(v.trim()) ? v.trim() + 'px' : v;
}

/**
 * A scrollable container that replaces the native scrollbars with styled, auto-hiding overlay
 * scrollbars, vertical, horizontal or on both axes.
 */
component('pdx-scroll-area', {
    props: {
        /** Scrollbar visibility: auto (show on scroll+hover), always, hover (show on hover only), never */
        type: { type: String, default: 'auto' },
        /** Axis: vertical (default), horizontal, both */
        axis: { type: String, default: 'vertical' },
        /** Auto-hide delay in ms (0 = never hide). Used when type=auto */
        scrollHideDelay: { type: Number, default: 1200 },
        /** Max height (CSS value). Enables scroll when content overflows */
        maxHeight: { type: String, default: '' },
        /** Height (CSS value) */
        height: { type: String, default: '' },
        /** Names the scrollable area ("Release notes") and makes it a region landmark. Empty: no
         *  landmark — the area stays focusable (tabindex 0) so the keyboard can scroll it. */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        let _built = false;
        let _scrollbar: ScrollbarReturn | null = null;
        let _viewportEl: HTMLElement | null = null;

        /**
         * A region only when it has a name of its own, or four scroll areas on one page would be four
         * landmarks all called "Scrollable content": without `label` the viewport keeps
         * tabindex 0, so the keyboard can still scroll it, and is no landmark.
         */
        function applyRegion(): void {
            if (!_viewportEl) return;
            const label = ctx.label() as string;
            if (label) {
                _viewportEl.setAttribute('role', 'region');
                _viewportEl.setAttribute('aria-label', label);
            } else {
                _viewportEl.removeAttribute('role');
                _viewportEl.removeAttribute('aria-label');
            }
        }
        ctx.track(() => {
            void ctx.label();
            applyRegion();
        });

        ctx.track(() => {
            const scrollType = ctx.type() as string;
            const axis = ctx.axis() as string;
            const hideDelay = ctx.scrollHideDelay() as number;
            const maxHeight = ctx.maxHeight() as string;
            const height = ctx.height() as string;

            if (!_built) {
                _built = true;
                requestAnimationFrame(() => {
                    ctx.el.classList.add('pdx-scroll-area');

                    // The viewport is in the template, around the slot: the children are projected
                    // into it when the scroll area mounts. They are not MOVED into a viewport built
                    // here, a frame after they have mounted: a move is a disconnect, and every component
                    // inside would be destroyed and set up again while the first setup's frame still
                    // builds its DOM — a pdx-mention would come out with three textareas.
                    _viewportEl = ctx.el.querySelector<HTMLElement>(':scope > .pdx-scroll-area-viewport');
                    if (!_viewportEl) return;
                    // Keyboard operability (WCAG 2.1.1): a scrollable region whose content alone is
                    // not focusable would be unreachable from the keyboard. tabindex=0 makes it
                    // focusable and scrollable with the arrows; role=region + aria-label only with `label`.
                    _viewportEl.tabIndex = 0;
                    applyRegion();
                    // It normalizes bare numeric values ("160", say) into px: without a unit the CSS is
                    // invalid and would be ignored in silence (the region would not be constrained).
                    if (maxHeight) _viewportEl.style.maxHeight = toCssLength(maxHeight);
                    if (height) _viewportEl.style.height = toCssLength(height);

                    // Set overflow based on axis
                    if (axis === 'horizontal') {
                        _viewportEl.style.overflowX = 'auto';
                        _viewportEl.style.overflowY = 'hidden';
                    } else if (axis === 'both') {
                        _viewportEl.style.overflow = 'auto';
                    } else {
                        _viewportEl.style.overflowX = 'hidden';
                        _viewportEl.style.overflowY = 'auto';
                    }

                    // Determine autoHideMs based on type
                    let autoHideMs = hideDelay;
                    if (scrollType === 'always') autoHideMs = 0;
                    else if (scrollType === 'never') autoHideMs = -1; // special: never show
                    else if (scrollType === 'hover') autoHideMs = 100;

                    // Hide native scrollbar
                    _viewportEl.style.scrollbarWidth = 'none'; // Firefox
                    _viewportEl.classList.add('pdx-scroll-area-hide-native');

                    // Apply useScrollbar only if type != 'never'
                    if (scrollType !== 'never') {
                        _scrollbar = useScrollbar(
                            () => _viewportEl,
                            {
                                axis: axis as 'vertical' | 'horizontal' | 'both',
                                mode: 'overlay',
                                autoHideMs,
                            }
                        );
                        // The primitive attaches listeners/observers: dispose on destroy
                        ctx.track(() => () => { _scrollbar?.dispose(); _scrollbar = null; });
                    }

                    // Wheel → horizontal scroll for horizontal-only axis
                    if (axis === 'horizontal') {
                        _viewportEl.addEventListener('wheel', (e: WheelEvent) => {
                            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                                e.preventDefault();
                                _viewportEl!.scrollLeft += e.deltaY;
                            }
                        }, { passive: false });
                    }

                    // Scroll event emission
                    _viewportEl.addEventListener('scroll', () => {
                        ctx.emit('pdx-scroll', {
                            scrollTop: _viewportEl!.scrollTop,
                            scrollLeft: _viewportEl!.scrollLeft,
                            scrollHeight: _viewportEl!.scrollHeight,
                            scrollWidth: _viewportEl!.scrollWidth,
                            clientHeight: _viewportEl!.clientHeight,
                            clientWidth: _viewportEl!.clientWidth,
                        });
                    }, { passive: true });

                    // Edge detection data attributes
                    const _updateEdges = () => {
                        if (!_viewportEl) return;
                        const atTop = _viewportEl.scrollTop <= 1;
                        const atBottom = _viewportEl.scrollTop + _viewportEl.clientHeight >= _viewportEl.scrollHeight - 1;
                        const atLeft = _viewportEl.scrollLeft <= 1;
                        const atRight = _viewportEl.scrollLeft + _viewportEl.clientWidth >= _viewportEl.scrollWidth - 1;
                        ctx.el.toggleAttribute('data-at-top', atTop);
                        ctx.el.toggleAttribute('data-at-bottom', atBottom);
                        if (axis === 'horizontal' || axis === 'both') {
                            ctx.el.toggleAttribute('data-at-left', atLeft);
                            ctx.el.toggleAttribute('data-at-right', atRight);
                        }
                    };
                    _viewportEl.addEventListener('scroll', _updateEdges, { passive: true });
                    _updateEdges();
                });
                return;
            }
        });

        // Imperative API — namespaced under `scrollArea` because scrollTo/scrollBy/scrollIntoView
        // are native Element methods; flattening them onto the host would shadow the natives.
        ctx.expose({
            /**
             * Helpers over the inner viewport, reached as `el.scrollArea.scrollTo(…)`: the host is not
             * the element that scrolls, so the natives would act on the wrong box (which is also why
             * they are namespaced here rather than flattened onto the host).
             */
            scrollArea: {
                scrollTo: (opts: ScrollToOptions) => _viewportEl?.scrollTo(opts),
                scrollBy: (opts: ScrollToOptions) => _viewportEl?.scrollBy(opts),
                scrollIntoView: (el: HTMLElement, opts?: ScrollIntoViewOptions) => el.scrollIntoView(opts),
                getViewport: () => _viewportEl,
                recalculate: () => _scrollbar?.recalculate(),
            },
        });

        return {};
    },
    render: () => html`<div class="pdx-scroll-area-viewport"><slot></slot></div>`,
});
