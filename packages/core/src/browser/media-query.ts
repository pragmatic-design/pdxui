// useMediaQuery — reactive matchMedia signal.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

const isBrowser = typeof window !== 'undefined';

/**
 * Create a reactive signal from a CSS media query.
 * Updates automatically when the media query match state changes.
 *
 * Usage:
 *   const isDark = useMediaQuery('(prefers-color-scheme: dark)');
 *   const isWide = useMediaQuery('(min-width: 1200px)');
 */
export function useMediaQuery(query: string): ReadonlySignal<boolean> {
    if (!isBrowser) return computed(() => false);

    const mql = window.matchMedia(query);
    const sig = signal(mql.matches);
    mql.addEventListener('change', (e) => sig.set(e.matches));
    return computed(() => sig());
}
