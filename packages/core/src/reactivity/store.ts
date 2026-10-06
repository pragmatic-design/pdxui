// Deep Reactive Store — Proxy-based state with automatic change tracking.
// Unlike signal (explicit .set()), store allows direct mutation:
//   state.items.push(item)   → triggers reactive update
//   state.filter = 'active'  → triggers reactive update
//
// Each property path gets its own fine-grained signal for targeted updates.

import { signal } from './signal';
import type { Signal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

/** Weak cache: source object → proxy (avoid creating duplicate proxies). */
const proxyCache = new WeakMap<object, unknown>();

/** Weak cache: source object → property signal map. */
const signalMap = new WeakMap<object, Map<string | symbol, Signal<unknown>>>();

/** Sentinel to detect tracked reads inside effects (iteration tracking). */
const STORE_BRAND = Symbol('pdx-store');

/** Monotonic version counter — avoids Math.random() allocation per mutation. */
let storeVersion = 0;

// ─── Array Method Interception ────────────────────────────────────

/** Array methods that mutate the array — must trigger reactive update. */
const ARRAY_MUTATING = new Set([
    'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin',
]);

/** Map/Set methods that mutate — must trigger reactive update. */
const MAP_MUTATING = new Set(['set', 'delete', 'clear']);
const SET_MUTATING = new Set(['add', 'delete', 'clear']);

// ─── store() ──────────────────────────────────────────────────────

/**
 * Create a deep reactive proxy around an object.
 * Direct property mutations trigger fine-grained signal updates.
 *
 * @param initial - The initial state object
 * @returns A proxy that looks identical but tracks all reads/writes reactively
 */
export function store<T extends object>(initial: T): T {
    return createProxy(initial) as T;
}

/**
 * Create a SHALLOW reactive proxy — only top-level property changes are tracked.
 * Nested objects are NOT proxied. Ideal for large immutable datasets (DataTable, API responses).
 * Triggers reactivity only on reassignment, NOT on deep mutation.
 *
 * Usage:
 *   const data = store.raw({ items: hugeArray, meta: { total: 1000 } });
 *   data.items = newArray;     // reactive — triggers subscribers
 *   data.items.push(x);       // NOT reactive — no proxy on nested
 *   data.meta = { total: 5 }; // reactive
 *   data.meta.total = 5;      // NOT reactive
 */
/**
 * Create a SHALLOW reactive proxy — only top-level property changes are tracked.
 * Nested objects are NOT proxied. Ideal for large immutable datasets (DataTable, API responses).
 *
 * Usage:
 *   const data = shallowStore({ items: hugeArray, meta: { total: 1000 } });
 *   data.items = newArray;     // reactive
 *   data.items.push(x);       // NOT reactive (no deep proxy)
 */
export function shallowStore<T extends object>(initial: T): T {
    const signals = new Map<string | symbol, Signal<unknown>>();
    const proxy = new Proxy(initial, {
        get(obj, prop, receiver) {
            if (prop === STORE_BRAND) return true;
            const value = Reflect.get(obj, prop, receiver);
            getOrCreateSignal(signals, prop, value);
            return value; // NO recursive proxy
        },
        set(obj, prop, newValue, receiver) {
            const oldValue = Reflect.get(obj, prop, receiver);
            const result = Reflect.set(obj, prop, newValue, receiver);
            if (!Object.is(oldValue, newValue)) bumpSignal(signals, prop, newValue);
            return result;
        },
        deleteProperty(obj, prop) {
            const result = Reflect.deleteProperty(obj, prop);
            bumpSignal(signals, prop, undefined);
            return result;
        },
    });
    return proxy;
}

/** Create a reactive proxy for an object (recursive for nested). */
function createProxy<T extends object>(target: T): T {
    // Return cached proxy if already created
    const cached = proxyCache.get(target);
    if (cached) return cached as T;

    const signals = new Map<string | symbol, Signal<unknown>>();
    signalMap.set(target, signals);

    const proxy = new Proxy(target, {
        get(obj, prop, receiver) {
            // Brand check
            if (prop === STORE_BRAND) return true;

            // Use obj directly (not receiver) for Map/Set to avoid "incompatible receiver" errors
            const value = (obj instanceof Map || obj instanceof Set)
                ? Reflect.get(obj, prop)
                : Reflect.get(obj, prop, receiver);

            // Intercept mutating array methods — fine-grained index notification
            if (Array.isArray(obj) && typeof prop === 'string' && ARRAY_MUTATING.has(prop)) {
                return (...args: unknown[]) => {
                    const prevLen = obj.length;
                    const result = (value as (...a: unknown[]) => unknown).apply(obj, args);
                    const newLen = obj.length;
                    // Notify length if changed
                    if (prevLen !== newLen) bumpSignal(signals, 'length', newLen);
                    // Notify affected indices based on method semantics
                    notifyArrayMutation(signals, obj, prop, prevLen, args);
                    // Version bump for iteration tracking (subscribers of the whole array)
                    bumpSignal(signals, STORE_BRAND, ++storeVersion);
                    return result;
                };
            }

            // Intercept Map mutating methods
            if (obj instanceof Map && typeof prop === 'string' && MAP_MUTATING.has(prop)) {
                return (...args: unknown[]) => {
                    const result = (value as (...a: unknown[]) => unknown).apply(obj, args);
                    bumpSignal(signals, 'size', obj.size);
                    // Notify the specific key for Map.set/delete
                    if ((prop === 'set' || prop === 'delete') && args[0] !== undefined) {
                        bumpSignal(signals, String(args[0]), prop === 'delete' ? undefined : args[1]);
                    }
                    bumpSignal(signals, STORE_BRAND, ++storeVersion);
                    return result;
                };
            }

            // Intercept Set mutating methods
            if (obj instanceof Set && typeof prop === 'string' && SET_MUTATING.has(prop)) {
                return (...args: unknown[]) => {
                    const result = (value as (...a: unknown[]) => unknown).apply(obj, args);
                    bumpSignal(signals, 'size', obj.size);
                    bumpSignal(signals, STORE_BRAND, ++storeVersion);
                    return result;
                };
            }

            // Non-mutating Map/Set methods (get, has, forEach, keys, values,
            // entries, Symbol.iterator…) are native and need `this` bound to the
            // raw target — calling them with the proxy as receiver throws
            // "incompatible receiver". Track iteration via STORE_BRAND so reads
            // re-run after mutations bump the version.
            if ((obj instanceof Map || obj instanceof Set) && typeof value === 'function') {
                getOrCreateSignal(signals, STORE_BRAND, storeVersion);
                return (value as (...a: unknown[]) => unknown).bind(obj);
            }

            // Track read — get or create a signal for this property
            getOrCreateSignal(signals, prop, value);

            // Recursively proxy nested objects — but ONLY plain objects/arrays.
            // Native instances (Map/Set/Date/RegExp/Promise/typed arrays) are
            // returned raw: proxying them breaks methods bound to the real receiver.
            if (value !== null && typeof value === 'object' && !isSignal(value) && isProxyableObject(value)) {
                return createProxy(value as object);
            }

            return value;
        },

        set(obj, prop, newValue, receiver) {
            // `arr.length = n` (the clear/truncation idiom): it notifies the truncated indexes
            // and the iteration version — bumping 'length' alone would leave the effects
            // subscribed to specific indexes stale.
            if (Array.isArray(obj) && prop === 'length') {
                const prevLen = obj.length;
                const result = Reflect.set(obj, prop, newValue, receiver);
                const newLen = obj.length;
                if (newLen < prevLen) {
                    for (let i = newLen; i < prevLen; i++) bumpSignal(signals, String(i), undefined);
                }
                if (newLen !== prevLen) {
                    bumpSignal(signals, 'length', newLen);
                    getOrCreateSignal(signals, STORE_BRAND, storeVersion);
                    bumpSignal(signals, STORE_BRAND, ++storeVersion);
                }
                return result;
            }

            // Prototype pollution guard: assigning these via Reflect.set(receiver)
            // would mutate the prototype chain. Define an OWN data property instead.
            if (prop === '__proto__' || prop === 'constructor' || prop === 'prototype') {
                const oldValue = (obj as Record<string, unknown>)[prop as string];
                Object.defineProperty(obj, prop, {
                    value: newValue,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
                if (!Object.is(oldValue, newValue)) bumpSignal(signals, prop, newValue);
                return true;
            }

            // A brand-new key (not present before) changes the key set, so any
            // effect enumerating keys (Object.keys / for…in / ownKeys trap) must
            // re-run. Per-property bumpSignal can't cover that — bump the shared
            // STORE_BRAND signal that ownKeys tracks (mirrors array iteration).
            const isNewKey = !(prop in (obj as object));

            const oldValue = Reflect.get(obj, prop, receiver);
            const result = Reflect.set(obj, prop, newValue, receiver);

            if (!Object.is(oldValue, newValue)) {
                bumpSignal(signals, prop, newValue);
            }
            if (isNewKey) {
                getOrCreateSignal(signals, STORE_BRAND, storeVersion);
                bumpSignal(signals, STORE_BRAND, ++storeVersion);
            }

            return result;
        },

        // Track key enumeration (Object.keys, for…in, spread) via STORE_BRAND so
        // adding/removing a key re-runs effects that read the key set.
        ownKeys(obj) {
            getOrCreateSignal(signals, STORE_BRAND, storeVersion);
            return Reflect.ownKeys(obj);
        },

        deleteProperty(obj, prop) {
            const existed = prop in (obj as object);
            const result = Reflect.deleteProperty(obj, prop);
            bumpSignal(signals, prop, undefined);
            if (existed) {
                getOrCreateSignal(signals, STORE_BRAND, storeVersion);
                bumpSignal(signals, STORE_BRAND, ++storeVersion);
            }
            return result;
        },
    });

    proxyCache.set(target, proxy);
    return proxy;
}

// ─── Signal Helpers ───────────────────────────────────────────────

/** Get or create a signal for a property, and read it (to track in current effect). */
function getOrCreateSignal(
    signals: Map<string | symbol, Signal<unknown>>,
    prop: string | symbol,
    currentValue: unknown
): Signal<unknown> {
    let sig = signals.get(prop);
    if (!sig) {
        sig = signal(currentValue);
        signals.set(prop, sig);
    }
    // Read the signal to establish dependency tracking
    sig();
    return sig;
}

/**
 * Update a property signal to notify subscribers.
 * Uses setRaw so a function value is stored verbatim — `signal.set` would
 * interpret a function argument as an updater and execute it.
 */
function bumpSignal(
    signals: Map<string | symbol, Signal<unknown>>,
    prop: string | symbol,
    newValue: unknown
): void {
    const sig = signals.get(prop);
    if (sig) {
        sig.setRaw(newValue);
    }
}

/** Notify fine-grained index signals for array mutations. */
function notifyArrayMutation(
    signals: Map<string | symbol, Signal<unknown>>,
    arr: unknown[],
    method: string,
    prevLen: number,
    args: unknown[],
): void {
    switch (method) {
        case 'push':
            // New elements at end: notify indices prevLen..newLen-1
            for (let i = prevLen; i < arr.length; i++) bumpSignal(signals, String(i), arr[i]);
            break;
        case 'pop':
            // Removed last element
            if (prevLen > 0) bumpSignal(signals, String(prevLen - 1), undefined);
            break;
        case 'unshift':
            // All indices shifted — notify all existing
            for (let i = 0; i < arr.length; i++) bumpSignal(signals, String(i), arr[i]);
            break;
        case 'shift':
            // All indices shifted down
            for (let i = 0; i < prevLen; i++) bumpSignal(signals, String(i), arr[i]);
            break;
        case 'splice': {
            const start = (args[0] as number) ?? 0;
            const end = Math.max(arr.length, prevLen);
            for (let i = start; i < end; i++) bumpSignal(signals, String(i), arr[i]);
            break;
        }
        case 'sort':
        case 'reverse':
        case 'fill':
        case 'copyWithin':
            // Potentially any index changed — notify all
            for (let i = 0; i < arr.length; i++) bumpSignal(signals, String(i), arr[i]);
            break;
    }
}

/** Check if a value is already a signal (don't proxy signals). */
function isSignal(value: unknown): boolean {
    return typeof value === 'function' && 'set' in (value as object) && 'peek' in (value as object);
}

/**
 * Whether a nested value is safe to wrap in a reactive Proxy.
 *
 * Plain objects, arrays, Map and Set are proxied: the get-trap intercepts their
 * mutating methods, so reactivity works (Map/Set have dedicated interception).
 *
 * Native objects with internal slots (Date, RegExp, Promise, WeakMap/WeakSet,
 * typed arrays) must be returned RAW: their methods need the real receiver
 * (`this`), otherwise calls throw "incompatible receiver" / "this is not a Date".
 */
function isProxyableObject(value: unknown): boolean {
    if (value === null || typeof value !== 'object') return false;
    if (Array.isArray(value)) return true;
    if (value instanceof Map || value instanceof Set) return true;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
