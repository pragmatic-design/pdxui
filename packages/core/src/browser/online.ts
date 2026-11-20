// useOnline — reactive navigator.onLine signal.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal, Signal } from '../utils/types';

const isBrowser = typeof window !== 'undefined';

// Created on the first `useOnline()`, with its listeners (#1246): an app that never asks has neither.
let _online: Signal<boolean> | null = null;

function online(): Signal<boolean> {
    if (_online) return _online;
    const sig = signal(isBrowser ? navigator.onLine : true);
    if (isBrowser) {
        window.addEventListener('online', () => sig.set(true));
        window.addEventListener('offline', () => sig.set(false));
    }
    return (_online = sig);
}

/**
 * Reactive online/offline status signal.
 * Updates automatically when the browser goes online/offline.
 */
export function useOnline(): ReadonlySignal<boolean> {
    const sig = online();
    return computed(() => sig());
}
