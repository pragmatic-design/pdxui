// useStorage — reactive localStorage/sessionStorage with cross-tab sync.

import { signal, effect } from '../reactivity/signal';
import type { Signal } from '../utils/types';

const isBrowser = typeof window !== 'undefined';

/**
 * Reactive localStorage signal with automatic persistence and cross-tab sync.
 *
 * @param key - Storage key
 * @param defaultValue - Default value if key doesn't exist
 * @param storage - 'local' (default) or 'session' for sessionStorage
 * @returns Signal that reads/writes to storage
 */
export function useStorage<T>(
    key: string,
    defaultValue: T,
    storage: 'local' | 'session' = 'local'
): Signal<T> {
    const store = isBrowser
        ? (storage === 'session' ? sessionStorage : localStorage)
        : null;

    // Read initial value from storage
    let initial = defaultValue;
    if (store) {
        try {
            const raw = store.getItem(key);
            if (raw !== null) initial = JSON.parse(raw) as T;
        } catch {
            // Invalid JSON — use default
        }
    }

    const sig = signal<T>(initial);

    // Write to storage on changes
    if (store) {
        effect(() => {
            const value = sig();
            try {
                store.setItem(key, JSON.stringify(value));
            } catch {
                // Storage full or blocked — ignore
            }
        });
    }

    // Cross-tab sync (localStorage only — sessionStorage is per-tab)
    if (isBrowser && storage === 'local') {
        window.addEventListener('storage', (e) => {
            if (e.key === key && e.newValue !== null) {
                try {
                    sig.set(JSON.parse(e.newValue) as T);
                } catch {
                    // Invalid JSON from another tab
                }
            }
        });
    }

    return sig;
}
