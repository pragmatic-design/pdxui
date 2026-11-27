// A global store owns what its factory creates, and has a lifecycle (#1458).
//
// The factory ran in whatever scope called it first: an effect it created — `$effect`, `$watch`, the
// persistence write — belonged to the first component that used the store, and died with it. Nothing
// disposed a store either: `clearStores()` emptied the registry and left every effect running. Now the
// factory runs in a scope of the store's own, outside any caller's; `onMount` runs once the store is
// created, its persisted state restored; `disposeStore(id)` and `clearStores()` run `onDestroy` and
// dispose the effects.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal, effect, collectDisposers } from '../src/reactivity/signal';
import { createGlobalStore, clearStores, disposeStore, getStore } from '../src/reactivity/global-store';

beforeEach(() => {
    clearStores();
    localStorage.clear();
});

/** Flush the reactive queue. */
const flush = () => new Promise<void>((r) => queueMicrotask(r));

describe('a store owns its effects', () => {
    it('an effect of the factory outlives the scope that first asked for the store', async () => {
        const seen: number[] = [];
        let count!: ReturnType<typeof signal<number>>;
        const [, disposeCaller] = collectDisposers(() => createGlobalStore('owned', () => {
            count = signal(0);
            effect(() => { seen.push(count()); });
            return { count };
        }));
        disposeCaller();
        count.set(1);
        await flush();
        expect(seen).toEqual([0, 1]);
    });

    it('disposeStore stops its effects, runs onDestroy, and forgets the store', async () => {
        const seen: number[] = [];
        const log: string[] = [];
        let count!: ReturnType<typeof signal<number>>;
        createGlobalStore('gone', (store) => {
            count = signal(0);
            effect(() => { seen.push(count()); });
            store.onDestroy(() => log.push('destroyed'));
            return { count };
        });
        expect(disposeStore('gone')).toBe(true);
        count.set(1);
        await flush();
        expect(seen).toEqual([0]);
        expect(log).toEqual(['destroyed']);
        expect(getStore('gone')).toBeUndefined();
        expect(disposeStore('gone')).toBe(false);
    });

    it('clearStores disposes every store', async () => {
        const log: string[] = [];
        createGlobalStore('a', (store) => { store.onDestroy(() => log.push('a')); return {}; });
        createGlobalStore('b', (store) => { store.onDestroy(() => log.push('b')); return {}; });
        clearStores();
        expect(log.sort()).toEqual(['a', 'b']);
    });
});

describe('onMount', () => {
    it('runs once the store is created, with its persisted state restored', () => {
        localStorage.setItem('__pdx_store_saved', JSON.stringify({ count: 7 }));
        const seen: number[] = [];
        createGlobalStore('saved', (store) => {
            const count = signal(0);
            store.onMount(() => seen.push(count()));
            return { count };
        }, { persist: 'local' });
        expect(seen).toEqual([7]);
    });

    it('can read the store through its own hook without creating it twice', () => {
        let created = 0;
        const make = () => createGlobalStore('self', (store) => {
            created++;
            store.onMount(() => { expect(make().n).toBe(1); });
            return { n: 1 };
        });
        make();
        expect(created).toBe(1);
    });

    it('runs once, not again for a later caller', () => {
        let mounted = 0;
        const make = () => createGlobalStore('once', (store) => { store.onMount(() => { mounted++; }); return {}; });
        make();
        make();
        expect(mounted).toBe(1);
    });
});
