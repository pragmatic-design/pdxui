// Virtualizer — efficient rendering of large lists/grids.
// Only renders visible items + overscan. Binary search for scroll position.
// Used by: pdx-select.

import { signal, computed, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export interface VirtualItem {
    /** Item index in the data source. */
    index: number;
    /** Start position in px from the top/left of the scroll container. */
    start: number;
    /** Size in px (estimated or measured). */
    size: number;
    /** Offset for CSS transform: translateY/X. */
    offsetStart: number;
}

export interface VirtualizerOptions {
    /** Reactive getter for the total number of items. */
    count: () => number;
    /** Estimate the size (height or width) of an item by index. */
    estimateSize: (index: number) => number;
    /** Number of extra items to render above/below the visible area. Default: 3. */
    overscan?: number;
    /** Horizontal mode (default: false = vertical). */
    horizontal?: boolean;
    /** Getter for the scroll container element. */
    getScrollElement: () => HTMLElement | null;
    /** Gap between items in px. Default: 0. */
    gap?: number;
}

export interface VirtualizerReturn {
    /** Currently visible items (reactive). */
    items: ReadonlySignal<VirtualItem[]>;
    /** Total size of all items in px (reactive). For the scroll container's inner div. */
    totalSize: ReadonlySignal<number>;
    /** Scroll to a specific item index. */
    scrollTo: (index: number, options?: { align?: 'start' | 'center' | 'end' }) => void;
    /**
     * Measure a rendered element (it carries `data-virtual-index`), and keep observing it: a later
     * change of size is measured again (for dynamic sizes).
     */
    measureElement: (el: HTMLElement | null) => void;
    /** Where any item is, rendered or not: its start and size, measured or estimated (#284). */
    itemRect: (index: number) => { start: number; size: number };
    /** Cleanup. */
    dispose: Dispose;
}

// ─── createVirtualizer ─────────────────────────────────────────

/**
 * Render only the rows that are on screen: given a count and a size estimate, it returns the window
 * to draw and the total height to reserve.
 *
 * `estimateSize` may be wrong — `measureElement` corrects it from the DOM as rows render, and keeps
 * observing each row it measured, which is what makes variable-height content work without
 * measuring everything up front. A row above the viewport that changes size moves the scroll
 * position with it, and `scrollTo` corrects itself once the rows it lands on are measured.
 *
 * `overscan` (3) is how many rows to draw beyond the viewport: too few and fast scrolling shows
 * blank space, too many and the saving disappears.
 */
export function createVirtualizer(options: VirtualizerOptions): VirtualizerReturn {
    const {
        count,
        estimateSize,
        overscan = 3,
        horizontal = false,
        getScrollElement,
        gap = 0,
    } = options;

    // ── Size cache: 3 tiers ──
    // Tier 1: estimated (from estimateSize)
    // Tier 2: measured — what `measureElement` read off a rendered item, and what the ResizeObserver
    //         it puts on that item reads again whenever the item changes size (#252)
    // Tier 3: cumulative offsets (binary search-ready)
    const measuredSizes = new Map<number, number>();

    function getItemSize(index: number): number {
        return measuredSizes.get(index) ?? estimateSize(index);
    }

    // ── Prefix-sum cache (Tier 3) ──
    // prefix[i] = cumulative offset of item i (sum of sizes+gap for items 0..i-1).
    // Length is prefix.length = (cachedCount + 1); prefix[n] = total content size.
    // Invalidated when count changes or a measurement updates (measureElement).
    // getCumulativeOffset / getTotalSize then read in O(1); findStartIndex stays
    // O(log n) (was O(n log n) when each probe recomputed the offset linearly).
    let prefix: number[] = [];
    let cachedCount = -1;
    let dirty = true;

    function invalidateOffsets(): void {
        dirty = true;
    }

    function rebuildPrefix(n: number): void {
        prefix = new Array(n + 1);
        prefix[0] = 0;
        for (let i = 0; i < n; i++) {
            prefix[i + 1] = prefix[i] + getItemSize(i) + gap;
        }
        cachedCount = n;
        dirty = false;
    }

    function ensurePrefix(): void {
        const n = count();
        if (dirty || n !== cachedCount) rebuildPrefix(n);
    }

    // ── Cumulative offset calculation (O(1) via prefix sum) ──
    function getCumulativeOffset(index: number): number {
        ensurePrefix();
        if (index <= 0) return 0;
        if (index >= prefix.length) {
            // Beyond cached range — extrapolate defensively (shouldn't normally hit).
            return prefix[prefix.length - 1] ?? 0;
        }
        return prefix[index];
    }

    function getTotalSize(): number {
        const n = count();
        if (n === 0) return 0;
        ensurePrefix();
        // prefix[n] includes a trailing gap; subtract it to match the previous
        // formula (offset(n-1) + size(n-1)) which has no trailing gap.
        return prefix[n] - gap;
    }

    // ── Binary search for first visible item ──
    function findStartIndex(scrollOffset: number, total: number): number {
        let lo = 0;
        let hi = total - 1;

        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const midOffset = getCumulativeOffset(mid);
            const midEnd = midOffset + getItemSize(mid);

            if (midEnd <= scrollOffset) {
                lo = mid + 1;
            } else if (midOffset > scrollOffset) {
                hi = mid - 1;
            } else {
                return mid; // scrollOffset is within this item
            }
        }

        return lo;
    }

    // ── Reactive state ──
    const _scrollOffset = signal(0);
    const _viewportSize = signal(0);
    // Bumped by measureElement when a real measurement differs from the estimate:
    // `set(v => v)` would be a no-op (the Object.is guard), and the invalidation would not propagate.
    const _measureVersion = signal(0);

    const _totalSize = computed(() => {
        count(); // track count changes
        _measureVersion(); // track re-measure (dynamic row heights)
        return getTotalSize();
    });

    const _items = computed((): VirtualItem[] => {
        const n = count();
        _measureVersion(); // track re-measure (dynamic row heights)
        if (n === 0) return [];

        const scrollPos = _scrollOffset();
        const vpSize = _viewportSize();

        const startIdx = Math.max(0, findStartIndex(scrollPos, n) - overscan);
        let endIdx = startIdx;

        // Walk forward until we exceed viewport + overscan
        let accumulated = getCumulativeOffset(startIdx);
        while (endIdx < n && accumulated < scrollPos + vpSize) {
            accumulated += getItemSize(endIdx) + gap;
            endIdx++;
        }
        endIdx = Math.min(n - 1, endIdx + overscan);

        const items: VirtualItem[] = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const start = getCumulativeOffset(i);
            const size = getItemSize(i);
            items.push({
                index: i,
                start,
                size,
                offsetStart: start, // for transform: translateY(offsetStart px)
            });
        }

        return items;
    });

    // ── Scroll listener ──
    let scrollCleanup: Dispose | null = null;
    let resizeCleanup: Dispose | null = null;
    // Function-scoped so dispose() (below) can tear down the scroll effect.
    let _disposeEffect: Dispose | null = null;

    if (isBrowser) {
        // Effect to attach/detach scroll listener when scroll element changes
        const disposeEffect = effect(() => {
            const scrollEl = getScrollElement();

            // Cleanup previous
            scrollCleanup?.();
            resizeCleanup?.();

            if (!scrollEl) return;

            const prop = horizontal ? 'scrollLeft' : 'scrollTop';
            const sizeProp = horizontal ? 'clientWidth' : 'clientHeight';

            _viewportSize.set(scrollEl[sizeProp]);

            const onScroll = () => {
                _scrollOffset.set(scrollEl[prop]);
            };

            const resizeObserver = new ResizeObserver(() => {
                _viewportSize.set(scrollEl[sizeProp]);
            });

            scrollEl.addEventListener('scroll', onScroll, { passive: true });
            resizeObserver.observe(scrollEl);

            scrollCleanup = () => {
                scrollEl.removeEventListener('scroll', onScroll);
            };
            resizeCleanup = () => {
                resizeObserver.disconnect();
            };
        });

        // Store for top-level dispose
        _disposeEffect = disposeEffect;
    }

    // ── scrollTo ──
    function getScrollPos(scrollEl: HTMLElement): number {
        return horizontal ? scrollEl.scrollLeft : scrollEl.scrollTop;
    }

    function setScrollPos(scrollEl: HTMLElement, pos: number): void {
        if (horizontal) scrollEl.scrollLeft = Math.max(0, pos);
        else scrollEl.scrollTop = Math.max(0, pos);
    }

    function targetOf(index: number, align: 'start' | 'center' | 'end' | undefined): number {
        const itemOffset = getCumulativeOffset(index);
        const itemSize = getItemSize(index);
        const vpSize = _viewportSize.peek();
        switch (align) {
            case 'center': return itemOffset - vpSize / 2 + itemSize / 2;
            case 'end': return itemOffset - vpSize + itemSize;
            default: return itemOffset;
        }
    }

    /** How many times `scrollTo` scrolls again once the items around the target are measured. */
    const SCROLL_CORRECTIONS = 3;
    let scrollToRun = 0;

    /**
     * Scroll to an item. The first jump goes where the estimates put it; the items rendered there
     * are then measured, which can move the target, so after each frame it scrolls again to where
     * the target now is — at most `SCROLL_CORRECTIONS` times, and only while it is more than 1 px off.
     * A newer `scrollTo` takes over from an older one still correcting.
     */
    function scrollTo(index: number, opts?: { align?: 'start' | 'center' | 'end' }): void {
        const scrollEl = getScrollElement();
        if (!scrollEl) return;
        const run = ++scrollToRun;
        setScrollPos(scrollEl, targetOf(index, opts?.align));
        if (typeof requestAnimationFrame === 'undefined') return;
        let passes = 0;
        const correct = (): void => {
            if (run !== scrollToRun || passes++ >= SCROLL_CORRECTIONS) return;
            const target = Math.max(0, targetOf(index, opts?.align));
            if (Math.abs(getScrollPos(scrollEl) - target) <= 1) return;
            setScrollPos(scrollEl, target);
            requestAnimationFrame(correct);
        };
        requestAnimationFrame(correct);
    }

    // ── measureElement ──

    /**
     * Take a measurement of item `index`. When the item is above the first visible one, the scroll
     * position moves by the same amount: the content the reader is looking at stays where it is,
     * instead of being pushed down by an image that loaded far above it.
     */
    function applySize(index: number, size: number): void {
        const prev = getItemSize(index);
        if (measuredSizes.get(index) === size) return;
        const scrollEl = getScrollElement();
        const above = scrollEl !== null && index < findStartIndex(getScrollPos(scrollEl), count());
        measuredSizes.set(index, size);
        invalidateOffsets(); // measured size changed → prefix sum is stale
        _measureVersion.set(v => v + 1); // notifies _items/_totalSize
        if (above && size !== prev) {
            setScrollPos(scrollEl!, getScrollPos(scrollEl!) + (size - prev));
            _scrollOffset.set(getScrollPos(scrollEl!));
        }
    }

    function sizeOf(el: HTMLElement): number {
        return horizontal ? el.offsetWidth : el.offsetHeight;
    }

    /**
     * One observer for every item handed to `measureElement`: an item measured once and resized
     * later — an image that loads, a row that wraps — is measured again. A target that has left the
     * document is unobserved, not measured at 0.
     */
    let itemObserver: ResizeObserver | null = null;
    function observeItem(el: HTMLElement): void {
        if (typeof ResizeObserver === 'undefined') return;
        itemObserver ??= new ResizeObserver((entries) => {
            for (const entry of entries) {
                const target = entry.target as HTMLElement;
                if (!target.isConnected) {
                    itemObserver?.unobserve(target);
                    continue;
                }
                const index = Number(target.dataset.virtualIndex);
                if (!isNaN(index)) applySize(index, sizeOf(target));
            }
        });
        itemObserver.observe(el);
    }

    function measureElement(el: HTMLElement | null): void {
        if (!el) return;
        const index = Number(el.dataset.virtualIndex);
        if (isNaN(index)) return;
        // An element not in the document has no size yet: read now, it would be measured at 0. It is
        // observed, and the observer measures it once it is laid out (#283).
        if (el.isConnected) applySize(index, sizeOf(el));
        observeItem(el);
    }

    return {
        items: _items,
        totalSize: _totalSize,
        scrollTo,
        measureElement,
        itemRect: (index) => ({ start: getCumulativeOffset(index), size: getItemSize(index) }),
        dispose: () => {
            if (isBrowser) _disposeEffect?.();
            scrollCleanup?.();
            resizeCleanup?.();
            itemObserver?.disconnect();
            itemObserver = null;
            scrollToRun++;
            measuredSizes.clear();
        },
    };
}
