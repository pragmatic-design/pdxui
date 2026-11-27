// Global Store — Singleton reactive stores with optional persistence.
// Used by @store rune: the compiler generates createGlobalStore() calls.

import { effect, collectDisposers, untracked, unowned } from './signal';
import type { Dispose } from '../utils/types';
import { registerStore, unregisterStores } from '../debug/inspector';
import { DEV } from '../utils/env';

const registry = new Map<string, unknown>();
/** Each store's teardown: its onDestroy callbacks, then the effects its factory created (#1458). */
const teardowns = new Map<string, Dispose>();

export interface GlobalStoreOptions {
    persist?: 'local' | 'session';
}

/** The lifecycle a store's factory registers on: what `onMount` and `onDestroy` compile to in a `@store`. */
export interface StoreLifecycle {
    /** Run `fn` once the store is created, its persisted state restored. */
    onMount(fn: () => void): void;
    /** Run `fn` when the store is disposed: `disposeStore(id)`, or `clearStores()`. */
    onDestroy(fn: () => void): void;
}

/**
 * Create or retrieve a singleton global store.
 * The setup function runs only once per store ID.
 * If persist is set, the store's signals are synced to storage.
 *
 * The factory runs in a scope of the store's own, outside the caller's (#1458): an effect it
 * creates — an `$effect`, a `$watch`, the persistence write — lives as long as the store, not as long
 * as the first component that asked for it, and is disposed with the store.
 *
 * @param id - Unique store identifier (compiler uses the @store name)
 * @param setupFn - Factory function that returns the store's public API, given its lifecycle
 * @param options - Optional persistence config
 * @returns The store instance (same reference for same ID)
 */
export function createGlobalStore<T>(
    id: string,
    setupFn: (store: StoreLifecycle) => T,
    options?: GlobalStoreOptions,
): T {
    // Singleton: return existing instance if already created
    const existing = registry.get(id);
    if (existing !== undefined) return existing as T;

    const mounted: (() => void)[] = [];
    const destroyed: (() => void)[] = [];
    const lifecycle: StoreLifecycle = {
        onMount: (fn) => { mounted.push(fn); },
        onDestroy: (fn) => { destroyed.push(fn); },
    };
    // Unowned, then a scope of its own: the caller's scope — a component's setup — neither owns nor
    // tracks what the factory creates.
    const [instance, disposeEffects] = unowned(() => collectDisposers(() => setUp(id, setupFn, lifecycle, options)));
    teardowns.set(id, () => {
        for (const fn of destroyed) untracked(fn);
        disposeEffects();
    });

    // The inspector lists it at level 2: `__pdx_debug.stores()`.
    if (DEV) registerStore(id, instance);

    // Registered first: an onMount that reads the store through its own hook gets this instance.
    for (const fn of mounted) untracked(fn);
    return instance;
}

/**
 * Dispose the store `id`: its `onDestroy` callbacks run, the effects its factory created stop, and the
 * next `createGlobalStore(id, …)` creates it anew. Whether there was a store to dispose.
 */
export function disposeStore(id: string): boolean {
    const teardown = teardowns.get(id);
    if (!teardown) return false;
    teardowns.delete(id);
    registry.delete(id);
    teardown();
    return true;
}

/** The store's factory run, the instance registered, its persisted state restored and synced. */
function setUp<T>(id: string, setupFn: (store: StoreLifecycle) => T, lifecycle: StoreLifecycle, options?: GlobalStoreOptions): T {
    // Run setup (only once)
    const instance = setupFn(lifecycle);
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

    return instance;
}

/**
 * Get a registered store by ID (for DevTools/testing).
 */
export function getStore<T = unknown>(id: string): T | undefined {
    return registry.get(id) as T | undefined;
}

/**
 * Dispose every store (for testing): each one's `onDestroy` runs and its effects stop. It emptied the
 * registry and left every effect running, one more set per test (#1458).
 */
export function clearStores(): void {
    for (const id of [...teardowns.keys()]) disposeStore(id);
    registry.clear();
    if (DEV) unregisterStores();
}
