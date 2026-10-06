// Custom scrollbar — cross-browser consistent, controllable, overlay-capable.
// Used by: Select dropdown, Combobox, List, DataGrid, Tree, ScrollArea.
// Wraps the container in a position:relative wrapper, overlays track elements
// OUTSIDE the scroll flow so they don't scroll with content.

import { signal, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';
import { moveMounted } from './element';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export interface ScrollbarOptions {
    /** Scrollbar mode. 'overlay' floats on top (doesn't shrink content). Default: 'overlay'. */
    mode?: 'overlay' | 'inset';
    /** Which axes to show scrollbars for. Default: 'vertical'. */
    axis?: 'vertical' | 'horizontal' | 'both';
    /** Minimum thumb size in px. Default: 24. */
    minThumbSize?: number;
    /** Auto-hide after idle ms. Default: 1200. 0 = always visible. */
    autoHideMs?: number;
    /** Custom CSS class for the scrollbar track. */
    trackClass?: string;
    /** Custom CSS class for the scrollbar thumb. */
    thumbClass?: string;
}

export interface ScrollbarReturn {
    /** Current scroll position (reactive). */
    scrollTop: ReadonlySignal<number>;
    scrollLeft: ReadonlySignal<number>;
    /** Scroll programmatically. */
    scrollTo(options: { top?: number; left?: number; behavior?: ScrollBehavior }): void;
    scrollBy(options: { top?: number; left?: number; behavior?: ScrollBehavior }): void;
    /** Scroll to make an element visible. */
    scrollIntoView(el: HTMLElement, options?: { block?: ScrollLogicalPosition }): void;
    /** Force recalculation (after content size changes). */
    recalculate(): void;
    /** Cleanup. */
    dispose: Dispose;
}

// ─── useScrollbar ─────────────────────────────────────────────

/**
 * Attach custom scrollbar to a scrollable container.
 * Creates a wrapper around the container with overlay track+thumb elements
 * that stay fixed relative to the visible area (not the scroll content).
 */
export function useScrollbar(
    el: () => HTMLElement | null,
    options?: ScrollbarOptions,
): ScrollbarReturn {
    const axis = options?.axis ?? 'vertical';
    const minThumbSize = options?.minThumbSize ?? 24;
    const autoHideMs = options?.autoHideMs ?? 1200;

    const _scrollTop = signal(0);
    const _scrollLeft = signal(0);

    let container: HTMLElement | null = null;
    let wrapper: HTMLElement | null = null;
    let vTrack: HTMLElement | null = null;
    let vThumb: HTMLElement | null = null;
    let hTrack: HTMLElement | null = null;
    let hThumb: HTMLElement | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let isDragging = false;
    let dragAxis: 'v' | 'h' = 'v';
    let dragStartY = 0;
    let dragStartX = 0;
    let dragStartScroll = 0;

    function createTrackAndThumb(isVertical: boolean): { track: HTMLElement; thumb: HTMLElement } {
        const track = document.createElement('div');
        track.setAttribute('data-pdx-scrollbar-track', isVertical ? 'v' : 'h');
        const thumb = document.createElement('div');
        thumb.setAttribute('data-pdx-scrollbar-thumb', '');

        // Track is positioned absolute in the WRAPPER (not the scroll container)
        // so it stays fixed relative to the visible viewport of the container.
        track.style.cssText = isVertical
            ? 'position:absolute;top:0;right:0;bottom:0;width:8px;z-index:10;'
            : 'position:absolute;bottom:0;left:0;right:0;height:8px;z-index:10;';

        thumb.style.cssText = isVertical
            ? 'position:absolute;right:1px;width:6px;border-radius:3px;background:color-mix(in oklab, var(--pdx-color-text, #000) 38%, transparent);cursor:pointer;transition:opacity 200ms;min-height:' + minThumbSize + 'px;'
            : 'position:absolute;bottom:1px;height:6px;border-radius:3px;background:color-mix(in oklab, var(--pdx-color-text, #000) 38%, transparent);cursor:pointer;transition:opacity 200ms;min-width:' + minThumbSize + 'px;';

        thumb.style.opacity = '0'; // start hidden

        if (options?.trackClass) track.classList.add(options.trackClass);
        if (options?.thumbClass) thumb.classList.add(options.thumbClass);

        track.appendChild(thumb);
        return { track, thumb };
    }

    function recalculate(): void {
        if (!container) return;

        const { scrollHeight, clientHeight, scrollWidth, clientWidth, scrollTop, scrollLeft } = container;

        _scrollTop.set(scrollTop);
        _scrollLeft.set(scrollLeft);

        // Vertical thumb
        if (vThumb && vTrack && (axis === 'vertical' || axis === 'both')) {
            const ratio = clientHeight / scrollHeight;
            if (ratio >= 1) {
                vTrack.style.display = 'none';
            } else {
                vTrack.style.display = '';
                const thumbH = Math.max(minThumbSize, ratio * clientHeight);
                const maxScroll = scrollHeight - clientHeight;
                const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * (clientHeight - thumbH) : 0;
                vThumb.style.height = thumbH + 'px';
                vThumb.style.top = thumbTop + 'px';
            }
        }

        // Horizontal thumb
        if (hThumb && hTrack && (axis === 'horizontal' || axis === 'both')) {
            const ratio = clientWidth / scrollWidth;
            if (ratio >= 1) {
                hTrack.style.display = 'none';
            } else {
                hTrack.style.display = '';
                const thumbW = Math.max(minThumbSize, ratio * clientWidth);
                const maxScroll = scrollWidth - clientWidth;
                const thumbLeft = maxScroll > 0 ? (scrollLeft / maxScroll) * (clientWidth - thumbW) : 0;
                hThumb.style.width = thumbW + 'px';
                hThumb.style.left = thumbLeft + 'px';
            }
        }

        showThumbs();
    }

    function showThumbs(): void {
        if (vThumb) vThumb.style.opacity = '1';
        if (hThumb) hThumb.style.opacity = '1';
        scheduleHide();
    }

    function scheduleHide(): void {
        if (hideTimer) clearTimeout(hideTimer);
        if (autoHideMs > 0 && !isDragging) {
            hideTimer = setTimeout(() => {
                if (!isDragging) {
                    if (vThumb) vThumb.style.opacity = '0';
                    if (hThumb) hThumb.style.opacity = '0';
                }
            }, autoHideMs);
        }
    }

    // Thumb drag
    function onThumbPointerDown(e: PointerEvent, isVertical: boolean): void {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        dragAxis = isVertical ? 'v' : 'h';
        dragStartY = e.clientY;
        dragStartX = e.clientX;
        dragStartScroll = isVertical ? (container?.scrollTop ?? 0) : (container?.scrollLeft ?? 0);
        document.addEventListener('pointermove', onThumbPointerMove);
        document.addEventListener('pointerup', onThumbPointerUp);
    }

    function onThumbPointerMove(e: PointerEvent): void {
        if (!container || !isDragging) return;
        if (dragAxis === 'v') {
            const ratio = container.scrollHeight / container.clientHeight;
            container.scrollTop = dragStartScroll + (e.clientY - dragStartY) * ratio;
        } else {
            const ratio = container.scrollWidth / container.clientWidth;
            container.scrollLeft = dragStartScroll + (e.clientX - dragStartX) * ratio;
        }
    }

    function onThumbPointerUp(): void {
        isDragging = false;
        document.removeEventListener('pointermove', onThumbPointerMove);
        document.removeEventListener('pointerup', onThumbPointerUp);
        scheduleHide();
    }

    // Track click — jump to position
    function onTrackClick(e: MouseEvent, isVertical: boolean): void {
        if (!container) return;
        if ((e.target as HTMLElement).hasAttribute('data-pdx-scrollbar-thumb')) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (isVertical) {
            const clickRatio = (e.clientY - rect.top) / rect.height;
            container.scrollTop = clickRatio * (container.scrollHeight - container.clientHeight);
        } else {
            const clickRatio = (e.clientX - rect.left) / rect.width;
            container.scrollLeft = clickRatio * (container.scrollWidth - container.clientWidth);
        }
    }

    let cleanupEffect: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const target = el();
            if (!target) return;
            container = target;

            // Hide native scrollbar
            target.style.overflow = 'auto';
            target.style.scrollbarWidth = 'none'; // Firefox
            const styleId = 'pdx-sb-' + Math.random().toString(36).slice(2, 8);
            target.setAttribute('data-pdx-scrollbar', styleId);
            const styleEl = document.createElement('style');
            styleEl.textContent = `[data-pdx-scrollbar="${styleId}"]::-webkit-scrollbar { display: none; }`;
            document.head.appendChild(styleEl);

            // Create wrapper AROUND container for positioning track overlay
            wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:relative;overflow:hidden;';
            // Sizing the wrapper: getComputedStyle().height is ALWAYS a used px value
            // (never 'auto') — copying it freezes flexible containers at whatever size they
            // had at init time. The real sizing signals are preferred
            // (inline height, flex, max-height); the px snapshot stays only as a fallback.
            const cs = getComputedStyle(target);
            const inlineHeight = target.style.height;
            const isFlexItem = cs.flexGrow !== '0' || (cs.flexBasis !== 'auto' && cs.flexBasis !== '');
            const hasMaxHeight = !!cs.maxHeight && cs.maxHeight !== 'none';
            // Whether the wrapper ends up with a height a percentage can resolve against.
            // A `max-height` alone does NOT count — see the note where the target is sized.
            let wrapperHasDefiniteHeight = true;
            if (inlineHeight) {
                wrapper.style.height = inlineHeight;
            } else if (isFlexItem) {
                wrapper.style.flex = cs.flex;
                wrapper.style.minHeight = '0';
            } else if (!hasMaxHeight && cs.height && cs.height !== 'auto') {
                wrapper.style.height = cs.height; // fallback: snapshot (comportamento precedente)
            } else {
                wrapperHasDefiniteHeight = false;
            }
            if (hasMaxHeight) wrapper.style.maxHeight = cs.maxHeight;
            if (cs.borderRadius) wrapper.style.borderRadius = cs.borderRadius;
            if (cs.border && cs.border !== 'none') {
                wrapper.style.border = cs.border;
                target.style.border = 'none';
            }

            // Insert wrapper before container, move container inside — without unmounting the
            // components in it: a plain move sets each of them up again, and pdx-scroll-area's
            // children would come out built twice.
            const wrap = wrapper;
            target.parentNode!.insertBefore(wrap, target);
            moveMounted(target, () => wrap.appendChild(target));

            // Container fills wrapper — but ONLY when the wrapper has a DEFINITE height.
            //
            // A percentage height resolves against the parent's height; against a parent that
            // is merely *capped* (`max-height`, no height) it resolves to `auto`. So in the
            // max-height-only case `height:100%` makes the target grow to its content, the
            // wrapper's `overflow:hidden` clips it, and the target — now exactly as tall as
            // its content — has nothing left to scroll: `scrollHeight === clientHeight`,
            // `scrollTop` pinned at 0. A scroll area that does not scroll, with everything
            // past the cap unreachable by any means (`scroll-area-vertical`: wrapper 160px,
            // target 288px, scrollTop stuck at 0).
            //
            // When the wrapper is only capped, the cap belongs on the SCROLLING element.
            if (wrapperHasDefiniteHeight) {
                target.style.height = '100%';
                target.style.maxHeight = '100%';
            } else if (hasMaxHeight) {
                target.style.maxHeight = cs.maxHeight;
            }
            target.style.borderRadius = '0';

            // Create tracks in WRAPPER (not container) — they don't scroll
            if (axis === 'vertical' || axis === 'both') {
                const v = createTrackAndThumb(true);
                vTrack = v.track; vThumb = v.thumb;
                vThumb.addEventListener('pointerdown', (e) => onThumbPointerDown(e, true));
                vTrack.addEventListener('click', (e) => onTrackClick(e, true));
                wrapper.appendChild(vTrack);
            }
            if (axis === 'horizontal' || axis === 'both') {
                const h = createTrackAndThumb(false);
                hTrack = h.track; hThumb = h.thumb;
                hThumb.addEventListener('pointerdown', (e) => onThumbPointerDown(e, false));
                hTrack.addEventListener('click', (e) => onTrackClick(e, false));
                wrapper.appendChild(hTrack);
            }

            // Show thumbs on mouse enter wrapper
            function onWrapperEnter() { showThumbs(); }
            wrapper.addEventListener('mouseenter', onWrapperEnter);

            // Listen to scroll events
            function onScroll() { recalculate(); }
            target.addEventListener('scroll', onScroll, { passive: true });

            // ResizeObserver for content/container size changes
            resizeObserver = new ResizeObserver(() => recalculate());
            resizeObserver.observe(target);
            if (target.firstElementChild) resizeObserver.observe(target.firstElementChild);

            // Initial calculation
            recalculate();

            return () => {
                target.removeEventListener('scroll', onScroll);
                wrapper?.removeEventListener('mouseenter', onWrapperEnter);
                resizeObserver?.disconnect();

                // Unwrap: move container back out of wrapper
                if (wrapper && wrapper.parentNode) {
                    const w = wrapper;
                    moveMounted(target, () => w.parentNode!.insertBefore(target, w));
                    wrapper.remove();
                }
                target.removeAttribute('data-pdx-scrollbar');
                styleEl.remove();
                if (hideTimer) clearTimeout(hideTimer);
            };
        });
    }

    return {
        scrollTop: _scrollTop as ReadonlySignal<number>,
        scrollLeft: _scrollLeft as ReadonlySignal<number>,
        scrollTo(opts) { container?.scrollTo(opts); },
        scrollBy(opts) { container?.scrollBy(opts); },
        scrollIntoView(target, opts) {
            target.scrollIntoView({ behavior: 'smooth', block: opts?.block ?? 'nearest' });
        },
        recalculate,
        dispose: () => { cleanupEffect?.(); },
    };
}
