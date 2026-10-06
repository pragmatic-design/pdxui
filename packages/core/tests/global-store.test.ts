// Tests for createGlobalStore runtime.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal, computed, effect } from '../src/reactivity/signal';
import { createGlobalStore, getStore, clearStores } from '../src/reactivity/global-store';

beforeEach(() => {
    clearStores();
    localStorage.clear();
    sessionStorage.clear();
});

describe('createGlobalStore()', () => {
    it('creates a store with setup function', () => {
        const store = createGlobalStore('counter', () => {
            const count = signal(0);
            return {
                count,
                increment: () => count.set(v => v + 1),
            };
        });

        expect(store.count()).toBe(0);
        store.increment();
        expect(store.count()).toBe(1);
    });

    it('returns same instance for same ID (singleton)', () => {
        const a = createGlobalStore('shared', () => ({ value: signal(42) }));
        const b = createGlobalStore('shared', () => ({ value: signal(99) }));

        expect(a).toBe(b);
        expect(b.value()).toBe(42); // second setup never ran
    });

    it('different IDs create different stores', () => {
        const a = createGlobalStore('store-a', () => ({ x: signal(1) }));
        const b = createGlobalStore('store-b', () => ({ x: signal(2) }));

        expect(a.x()).toBe(1);
        expect(b.x()).toBe(2);
    });

    it('computed works inside store', () => {
        const store = createGlobalStore('calc', () => {
            const price = signal(100);
            const tax = signal(0.2);
            const total = computed(() => price() * (1 + tax()));
            return { price, tax, total };
        });

        expect(store.total()).toBe(120);
        store.price.set(200);
        expect(store.total()).toBe(240);
    });

    it('effects work inside store', () => {
        const log: number[] = [];
        const store = createGlobalStore('effectful', () => {
            const count = signal(0);
            effect(() => { log.push(count()); });
            return { count };
        });

        expect(log).toEqual([0]);
        store.count.set(5);
        expect(log).toEqual([0, 5]);
    });
});

describe('getStore()', () => {
    it('returns undefined for non-existent store', () => {
        expect(getStore('nope')).toBeUndefined();
    });

    it('returns the store instance', () => {
        const created = createGlobalStore('lookup', () => ({ v: 1 }));
        expect(getStore('lookup')).toBe(created);
    });
});

describe('clearStores()', () => {
    it('removes all stores', () => {
        createGlobalStore('a', () => ({}));
        createGlobalStore('b', () => ({}));
        clearStores();
        expect(getStore('a')).toBeUndefined();
        expect(getStore('b')).toBeUndefined();
    });

    it('allows re-creating stores after clear', () => {
        createGlobalStore('reuse', () => ({ v: signal(1) }));
        clearStores();
        const store = createGlobalStore('reuse', () => ({ v: signal(99) }));
        expect(store.v()).toBe(99);
    });
});

describe('persistence', () => {
    it('saves signals to localStorage (debounced)', async () => {
        vi.useFakeTimers();
        const store = createGlobalStore('persist-test', () => ({
            name: signal('Alice'),
        }), { persist: 'local' });

        store.name.set('Bob');
        // Persistence is debounced (100ms) — advance timers
        vi.advanceTimersByTime(150);
        const saved = localStorage.getItem('__pdx_store_persist-test');
        expect(saved).toBeTruthy();
        const parsed = JSON.parse(saved!);
        expect(parsed.name).toBe('Bob');
        vi.useRealTimers();
    });

    it('loads saved state on creation', () => {
        localStorage.setItem('__pdx_store_preloaded', JSON.stringify({ count: 42 }));

        const store = createGlobalStore('preloaded', () => ({
            count: signal(0),
        }), { persist: 'local' });

        expect(store.count()).toBe(42);
    });

    it('sessionStorage works (debounced)', async () => {
        vi.useFakeTimers();
        const store = createGlobalStore('session-test', () => ({
            token: signal('abc'),
        }), { persist: 'session' });

        store.token.set('xyz');
        vi.advanceTimersByTime(150);
        const saved = sessionStorage.getItem('__pdx_store_session-test');
        expect(saved).toBeTruthy();
        expect(JSON.parse(saved!).token).toBe('xyz');
        vi.useRealTimers();
    });
});
