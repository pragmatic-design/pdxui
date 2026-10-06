// Container size — signal-based container awareness + measure utilities.
// CSS-first: container queries do the heavy lifting, JS for complex cases.
// Used by: Grid→Card, Table→stacked, Nav→hamburger, any adaptive component.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export interface ContainerSizeReturn {
    /** Container width in px (reactive). */
    width: ReadonlySignal<number>;
    /** Container height in px (reactive). */
    height: ReadonlySignal<number>;
    /** true when width < 480px. */
    isCompact: ReadonlySignal<boolean>;
    /** true when width 480-768px. */
    isMedium: ReadonlySignal<boolean>;
    /** true when width > 768px. */
    isWide: ReadonlySignal<boolean>;
    /** Cleanup. */
    dispose: Dispose;
}

export interface ContainerBreakpoints {
    compact?: number;  // Default: 480
    wide?: number;     // Default: 768
}

export interface MeasureResult {
    width: number;
    height: number;
    x: number;
    y: number;
}

export interface RelativeMeasureResult {
    dx: number;
    dy: number;
    overlap: boolean;
}

// ─── useContainerSize ──────────────────────────────────────────

/**
 * Signal-based container size awareness.
 * Uses ResizeObserver to track the container's dimensions reactively.
 * Breakpoint thresholds are configurable.
 */
export function useContainerSize(
    el: () => HTMLElement | null,
    breakpoints?: ContainerBreakpoints,
): ContainerSizeReturn {
    const compactThreshold = breakpoints?.compact ?? 480;
    const wideThreshold = breakpoints?.wide ?? 768;

    const _width = signal(0);
    const _height = signal(0);

    const isCompact = computed(() => _width() < compactThreshold);
    const isMedium = computed(() => _width() >= compactThreshold && _width() <= wideThreshold);
    const isWide = computed(() => _width() > wideThreshold);

    let observer: ResizeObserver | null = null;
    let currentEl: HTMLElement | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    if (isBrowser) {
        observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                _width.set(Math.round(width));
                _height.set(Math.round(height));
            }
        });

        // Observe via effect-like pattern: re-observe when el changes
        const checkEl = () => {
            if (!observer) return; // already disposed
            const target = el();
            if (target !== currentEl) {
                if (currentEl) observer.unobserve(currentEl);
                currentEl = target;
                if (target) {
                    observer.observe(target);
                    // Initial measurement
                    const rect = target.getBoundingClientRect();
                    _width.set(Math.round(rect.width));
                    _height.set(Math.round(rect.height));
                }
            }
        };

        // A one-shot (sync + 1 microtask) would die in silence if el()
        // resolved later (a conditional render, a rAF): it retries with a backoff
        // until the element appears, ~2s at most.
        let tries = 0;
        const retry = () => {
            checkEl();
            if (!currentEl && tries++ < 40) {
                retryTimer = setTimeout(retry, 50);
            }
        };
        retry();
    }

    return {
        width: computed(() => _width()),
        height: computed(() => _height()),
        isCompact,
        isMedium,
        isWide,
        dispose: () => {
            if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            currentEl = null;
        },
    };
}

// ─── measure ───────────────────────────────────────────────────

/** Measure an element's dimensions and position. Wrapper for getBoundingClientRect(). */
export function measure(el: HTMLElement): MeasureResult {
    if (!isBrowser) return { width: 0, height: 0, x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height, x: rect.x, y: rect.y };
}

/** Measure the relative position between two elements. */
export function measureRelative(el: HTMLElement, relativeTo: HTMLElement): RelativeMeasureResult {
    if (!isBrowser) return { dx: 0, dy: 0, overlap: false };

    const a = el.getBoundingClientRect();
    const b = relativeTo.getBoundingClientRect();

    const dx = a.x - b.x;
    const dy = a.y - b.y;

    // Check overlap
    const overlap = !(
        a.right < b.left || a.left > b.right ||
        a.bottom < b.top || a.top > b.bottom
    );

    return { dx, dy, overlap };
}

// ─── registerContainerQueries ──────────────────────────────────

/**
 * Register container queries on an element.
 * Sets `container-type: inline-size` and applies data-attributes for custom breakpoints.
 */
export function registerContainerQueries(
    el: HTMLElement,
    breakpoints?: Record<string, number>,
): Dispose {
    if (!isBrowser) return () => {};

    el.style.containerType = 'inline-size';

    if (!breakpoints) return () => { el.style.containerType = ''; };

    // Use ResizeObserver to set data-container-* attributes based on breakpoints
    const sortedBps = Object.entries(breakpoints).sort(([, a], [, b]) => b - a);

    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const width = entry.contentRect.width;
            for (const [name, threshold] of sortedBps) {
                if (width >= threshold) {
                    el.setAttribute(`data-container-${name}`, '');
                } else {
                    el.removeAttribute(`data-container-${name}`);
                }
            }
        }
    });

    observer.observe(el);

    return () => {
        observer.disconnect();
        el.style.containerType = '';
        for (const [name] of sortedBps) {
            el.removeAttribute(`data-container-${name}`);
        }
    };
}
