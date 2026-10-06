// Global Store — Singleton reactive stores with optional persistence.
// Used by @store rune: the compiler generates createGlobalStore() calls.

import { effect } from './signal';
import { registerStore, unregisterStores } from '../debug/inspector';

const registry = new Map<string, unknown>();

export interface GlobalStoreOptions {
    persist?: 'local' | 'session';
}

/**
 * Create or retrieve a singleton global store.
 * The setup function runs only once per store ID.
 * If persist is set, the store's signals are synced to storage.
 *
 * @param id - Unique store identifier (compiler uses the @store name)
 * @param setupFn - Factory function that returns the store's public API
 * @param options - Optional persistence config
 * @returns The store instance (same reference for same ID)
 */
export function createGlobalStore<T>(
    id: string,
    setupFn: () => T,
    options?: GlobalStoreOptions,
): T {
    // Singleton: return existing instance if already created
    const existing = registry.get(id);
    if (existing !== undefined) return existing as T;

    // Run setup (only once)
    const instance = setupFn();
    registry.set(id, instance);

    // Persistence: load from storage, then sync changes
    if (options?.persist && typeof window !== 'undefined') {
        const storage = options.persist === 'local' ? localStorage : sessionStorage;
        const storageKey = `__pdx_store_${id}`;

        // Load saved state
        try {
            const saved = storage.getItem(storageKey);
            if (saved !== null) {
                const data = JSON.parse(saved);
                // Apply saved values to any signal-like properties
                if (instance && typeof instance === 'object') {
                    for (const [key, value] of Object.entries(data)) {
                        const prop = (instance as Record<string, unknown>)[key];
                        if (prop && typeof prop === 'function' && 'set' in prop) {
                            (prop as { set: (v: unknown) => void }).set(value);
                        }
                    }
                }
            }
        } catch { /* ignore corrupted storage */ }

        // Per-signal persistence: one effect per signal, debounced write.
        // When signal A changes, only A is serialized — not the entire store.
        if (instance && typeof instance === 'object') {
            let writeTimer: ReturnType<typeof setTimeout> | null = null;
            let pendingSnapshot: Record<string, unknown> | null = null;

            // Collect all signal keys for batched writes
            const signalKeys: string[] = [];
            for (const [key, value] of Object.entries(instance as Record<string, unknown>)) {
                if (typeof value === 'function' && 'set' in value) {
                    signalKeys.push(key);
                }
            }

            // One effect per signal — only reads its own signal, marks dirty
            for (const key of signalKeys) {
                const sig = (instance as Record<string, unknown>)[key] as () => unknown;
                effect(() => {
                    const val = sig(); // track only THIS signal
                    if (!pendingSnapshot) pendingSnapshot = {};
                    pendingSnapshot[key] = val;

                    // Debounce: batch multiple signal writes into one storage.setItem
                    if (!writeTimer) {
                        writeTimer = setTimeout(() => {
                            if (pendingSnapshot) {
                                try {
                                    // Merge with existing storage data
                                    const existing = storage.getItem(storageKey);
                                    const full = existing ? JSON.parse(existing) : {};
                                    Object.assign(full, pendingSnapshot);
                                    storage.setItem(storageKey, JSON.stringify(full));
                                } catch { /* storage full */ }
                                pendingSnapshot = null;
                            }
                            writeTimer = null;
                        }, 100); // 100ms debounce
                    }
                });
            }
        }
    }

    // The inspector lists it at level 2: `__pdx_debug.stores()`.
    registerStore(id, instance);

    return instance;
}

/**
 * Get a registered store by ID (for DevTools/testing).
 */
export function getStore<T = unknown>(id: string): T | undefined {
    return registry.get(id) as T | undefined;
}

/**
 * Clear all registered stores (for testing).
 */
export function clearStores(): void {
    registry.clear();
    unregisterStores();
}
