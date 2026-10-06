// useOnline — reactive navigator.onLine signal.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

const isBrowser = typeof window !== 'undefined';

const _online = signal(isBrowser ? navigator.onLine : true);

if (isBrowser) {
    window.addEventListener('online', () => _online.set(true));
    window.addEventListener('offline', () => _online.set(false));
}

/**
 * Reactive online/offline status signal.
 * Updates automatically when the browser goes online/offline.
 */
export function useOnline(): ReadonlySignal<boolean> {
    return computed(() => _online());
}
