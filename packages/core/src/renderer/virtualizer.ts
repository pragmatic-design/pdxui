// Virtualizer — efficient rendering of large lists/grids.
// Only renders visible items + overscan. Binary search for scroll position.
// Used by: DataGrid, VirtualList, Tree, Combobox dropdown.

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
    /** Callback for measuring a rendered element (for dynamic sizes). */
    measureElement: (el: HTMLElement | null) => void;
    /** Cleanup. */
    dispose: Dispose;
}

// ─── createVirtualizer ─────────────────────────────────────────

/**
 * Render only the rows that are on screen: given a count and a size estimate, it returns the window
 * to draw and the total height to reserve.
 *
 * `estimateSize` may be wrong — `measureElement` corrects it from the DOM as rows render, which is
 * what makes variable-height content work without measuring everything up front.
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
    // Tier 2: measured (from ResizeObserver on rendered items)
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
    function scrollTo(index: number, opts?: { align?: 'start' | 'center' | 'end' }): void {
        const scrollEl = getScrollElement();
        if (!scrollEl) return;

        const itemOffset = getCumulativeOffset(index);
        const itemSize = getItemSize(index);
        const vpSize = _viewportSize.peek();

        let target: number;
        switch (opts?.align) {
            case 'center':
                target = itemOffset - vpSize / 2 + itemSize / 2;
                break;
            case 'end':
                target = itemOffset - vpSize + itemSize;
                break;
            default: // 'start'
                target = itemOffset;
                break;
        }

        if (horizontal) {
            scrollEl.scrollLeft = Math.max(0, target);
        } else {
            scrollEl.scrollTop = Math.max(0, target);
        }
    }

    // ── measureElement ──
    function measureElement(el: HTMLElement | null): void {
        if (!el) return;
        const index = Number(el.dataset.virtualIndex);
        if (isNaN(index)) return;

        const size = horizontal ? el.offsetWidth : el.offsetHeight;
        const prev = measuredSizes.get(index);
        if (prev !== size) {
            measuredSizes.set(index, size);
            invalidateOffsets(); // measured size changed → prefix sum is stale
            _measureVersion.set(v => v + 1); // notifies _items/_totalSize
        }
    }

    return {
        items: _items,
        totalSize: _totalSize,
        scrollTo,
        measureElement,
        dispose: () => {
            if (isBrowser) _disposeEffect?.();
            scrollCleanup?.();
            resizeCleanup?.();
            measuredSizes.clear();
        },
    };
}
