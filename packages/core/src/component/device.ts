// Device detection — reactive signals for viewport type, orientation, breakpoint.
// SSR-safe: defaults to desktop/landscape in Node.
// Lazy: matchMedia listeners created only on first access (not at import).

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';
import type { Breakpoint } from './responsive';

const isBrowser = typeof window !== 'undefined' && !!window.matchMedia;

// ─── Lazy media signal — listener created on first call ─────────

function lazyMediaSignal(query: string, fallback: boolean): ReadonlySignal<boolean> {
    if (!isBrowser) return computed(() => fallback);

    let inner: ReturnType<typeof signal<boolean>> | null = null;

    const read = () => {
        if (!inner) {
            const mql = window.matchMedia(query);
            inner = signal(mql.matches);
            mql.addEventListener('change', (e) => inner!.set(e.matches));
        }
        return inner();
    };

    read.peek = () => {
        if (!inner) return window.matchMedia(query).matches;
        return inner.peek();
    };

    return read as ReadonlySignal<boolean>;
}

// ─── Lazy breakpoint signal ─────────────────────────────────────

const breakpointQueries: [Breakpoint, string][] = [
    ['2xl', '(min-width: 1536px)'],
    ['xl',  '(min-width: 1280px)'],
    ['lg',  '(min-width: 1024px)'],
    ['md',  '(min-width: 768px)'],
    ['sm',  '(min-width: 640px)'],
];

function resolveBreakpoint(): Breakpoint {
    for (const [bp, query] of breakpointQueries) {
        if (window.matchMedia(query).matches) return bp;
    }
    return 'sm';
}

function createLazyBreakpointSignal(): ReadonlySignal<Breakpoint> {
    if (!isBrowser) return computed(() => 'lg' as Breakpoint);

    let inner: ReturnType<typeof signal<Breakpoint>> | null = null;

    const read = () => {
        if (!inner) {
            inner = signal<Breakpoint>(resolveBreakpoint());
            for (const [, query] of breakpointQueries) {
                window.matchMedia(query).addEventListener('change', () => {
                    inner!.set(resolveBreakpoint());
                });
            }
        }
        return inner();
    };

    read.peek = () => {
        if (!inner) return resolveBreakpoint();
        return inner.peek();
    };

    return read as ReadonlySignal<Breakpoint>;
}

// ─── Lazy instances ─────────────────────────────────────────────

const _isMobile  = lazyMediaSignal('(max-width: 767px)', false);
const _isTablet   = lazyMediaSignal('(min-width: 768px) and (max-width: 1023px)', false);
const _isDesktop  = lazyMediaSignal('(min-width: 1024px)', true);
const _isPortrait = lazyMediaSignal('(orientation: portrait)', false);

// ─── Public API ────────────────────────────────────────────────────

/**
 * Reactive device detection signals.
 * Lazy: matchMedia listeners are created only on first access, not at import.
 * SSR-safe: defaults to desktop/landscape.
 */
export const device = {
    /** true when viewport <= 767px. */
    isMobile: _isMobile,
    /** true when viewport 768px-1023px. */
    isTablet: _isTablet,
    /** true when viewport >= 1024px. */
    isDesktop: _isDesktop,
    /** Device type derived from viewport width. */
    type: computed(() => {
        if (_isMobile()) return 'mobile' as const;
        if (_isTablet()) return 'tablet' as const;
        return 'desktop' as const;
    }),
    /** true when viewport is portrait orientation. */
    isPortrait: _isPortrait,
    /** true when viewport is landscape orientation. */
    isLandscape: computed(() => !_isPortrait()),
    /** Current responsive breakpoint: 'sm' | 'md' | 'lg' | 'xl' | '2xl'. */
    breakpoint: createLazyBreakpointSignal(),
} as const;

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type Orientation = 'portrait' | 'landscape';
