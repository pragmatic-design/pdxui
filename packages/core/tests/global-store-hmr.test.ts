// A @store module run again by HMR creates its store anew, its signals' values carried over (#1468).
//
// The module calls createGlobalStore('name', factory) at its top level. Re-executed after an edit, the
// call found the name in the registry and returned the OLD instance: the edited factory never ran,
// and the old store's effects kept running the old code until a full reload. In dev the plugin puts
// `__pdx_store_hot('name', import.meta.hot)` before the call: on the module's second run it takes the
// old store's signal values and disposes it (onDestroy, its effects stopped), and createGlobalStore
// creates the store from the new factory and gives it those values — as a component's HMR keeps its
// signals' values.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal, effect } from '../src/reactivity/signal';
import { createGlobalStore, clearStores, __pdx_store_hot } from '../src/reactivity/global-store';

beforeEach(() => {
    clearStores();
    localStorage.clear();
});

const flush = () => new Promise<void>((r) => queueMicrotask(r));

/** What Vite gives a module as import.meta.hot: its `data` survives from one run of the module to the next. */
const hotFor = () => ({ data: {} as Record<string, unknown> });

describe('a store module run again by HMR', () => {
    it('creates the store from the new factory, with the old signals\' values, and stops the old one', async () => {
        const hot = hotFor();
        const log: string[] = [];

        // First run of the module.
        __pdx_store_hot('cart', hot);
        const v1 = createGlobalStore('cart', (store) => {
            const count = signal(0);
            effect(() => { log.push(`v1 ${count()}`); });
            store.onDestroy(() => log.push('v1 destroyed'));
            return { count, label: () => 'v1' };
        });
        v1.count.set(5);
        await flush();

        // The module edited and run again.
        __pdx_store_hot('cart', hot);
        const v2 = createGlobalStore('cart', () => {
            const count = signal(0);
            effect(() => { log.push(`v2 ${count()}`); });
            return { count, label: () => 'v2' };
        });

        expect(v2).not.toBe(v1);
        expect(v2.label()).toBe('v2');
        expect(v2.count(), 'the signal\'s value was not carried over').toBe(5);
        expect(log).toContain('v1 destroyed');

        log.length = 0;
        v1.count.set(9);
        v2.count.set(6);
        await flush();
        expect(log).toEqual(['v2 6']);
    });

    it('the first run of the module creates the store as without HMR', () => {
        const hot = hotFor();
        __pdx_store_hot('fresh', hot);
        const s = createGlobalStore('fresh', () => ({ n: signal(1) }));
        expect(s.n()).toBe(1);
        expect(createGlobalStore('fresh', () => ({ n: signal(2) }))).toBe(s);
    });

    it('a signal the new factory no longer has is dropped, and a new one keeps its initial value', () => {
        const hot = hotFor();
        __pdx_store_hot('shape', hot);
        const v1 = createGlobalStore('shape', () => ({ a: signal(1), gone: signal('x') }));
        v1.a.set(2);
        __pdx_store_hot('shape', hot);
        const v2 = createGlobalStore('shape', () => ({ a: signal(0), added: signal('new') })) as Record<string, ReturnType<typeof signal<unknown>>>;
        expect(v2.a()).toBe(2);
        expect(v2.added()).toBe('new');
        expect(v2.gone).toBeUndefined();
    });

    it('with no HMR (a build), there is nothing to do', () => {
        expect(() => __pdx_store_hot('x', undefined)).not.toThrow();
    });
});
