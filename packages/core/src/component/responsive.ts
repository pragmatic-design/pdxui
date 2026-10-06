// Responsive binding — signal that updates based on viewport breakpoints.
// Uses matchMedia listeners for efficient viewport tracking.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

/** Breakpoint keys matching PDX design tokens. */
export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Map of breakpoint → value. */
export type BreakpointMap<T> = Partial<Record<Breakpoint, T>>;

/** Default breakpoints aligned with Pragmatic Design CSS tokens. */
const defaultQueries: Record<Breakpoint, string> = {
    sm:   '(min-width: 640px)',
    md:   '(min-width: 768px)',
    lg:   '(min-width: 1024px)',
    xl:   '(min-width: 1280px)',
    '2xl': '(min-width: 1536px)',
};

/** Resolution order: largest first, so highest matching breakpoint wins. */
const bpOrder: Breakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm'];

/**
 * Creates a responsive signal that updates when viewport breakpoints change.
 *
 * Usage:
 *   const cols = responsive({ sm: 1, md: 2, lg: 3, xl: 4 });
 *   html`<pdx-grid :cols=${cols}>...</pdx-grid>`
 *
 * @param map - Breakpoint → value mapping
 * @param base - Fallback value when no breakpoint matches (below smallest defined)
 * @returns ReadonlySignal that updates on viewport changes
 */
export function responsive<T>(map: BreakpointMap<T>, base?: T): ReadonlySignal<T> {
    // Filter and sort entries: largest breakpoint first
    const entries = bpOrder
        .filter(bp => bp in map)
        .map(bp => ({ bp, query: defaultQueries[bp], value: map[bp] as T }));

    if (entries.length === 0) {
        throw new Error('responsive() requires at least one breakpoint');
    }

    // Fallback: explicit base, or the smallest breakpoint's value
    const fallback = base ?? entries[entries.length - 1].value;

    // Resolve: return value of largest matching breakpoint
    function resolve(): T {
        if (typeof window === 'undefined' || !window.matchMedia) return fallback;
        for (const { query, value } of entries) {
            if (window.matchMedia(query).matches) return value;
        }
        return fallback;
    }

    const inner = signal<T>(resolve());

    // Listen for viewport changes
    if (typeof window !== 'undefined' && window.matchMedia) {
        for (const { query } of entries) {
            const mql = window.matchMedia(query);
            mql.addEventListener('change', () => inner.set(resolve()));
        }
    }

    // Return as ReadonlySignal via computed (hides .set())
    return computed(() => inner());
}
