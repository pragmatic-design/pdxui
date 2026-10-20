// A route loader receives a LoaderContext (#505): the params coerced by the pattern's constraints, the
// query parsed with a repeated key as an array, and a signal aborted when a newer navigation
// supersedes it. A prefetched call gets the same context; a failure is kept in loaderError(path);
// levels still run outermost first, so a child reads its parent's data.
//
// The loader leg of the execution contract (docs/language/beta/data.md → «The execution contract»)
// is the last block: the read sources' legs are core/tests/async-contract.test.ts, and the router's
// is here, beside the router, since core does not import it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createRouter, destroyRouter, navigate, installRouteTable, registerGuardChecker,
    currentLoaderData, loaderData, loaderError,
} from '../src/runtime';
import type { LoaderContext } from '../src/runtime';
import { prefetchRoute, resetPrefetch } from '../src/prefetch';
import { resetLoaderPrefetch } from '../src/loader-prefetch';
import { resetLoadQueue } from '../../core/src/renderer/load-queue';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
const page = (name: string) => () => {
    const el = document.createElement('div');
    el.dataset.page = name;
    return el;
};

/** A promise the test settles by hand. */
function deferred<T = unknown>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

beforeEach(() => {
    destroyRouter();
    installRouteTable(null);
    resetPrefetch();
    resetLoadQueue();
    resetLoaderPrefetch();
    registerGuardChecker(() => true);
    history.replaceState(null, '', '/');
});

afterEach(() => { installRouteTable(null); });

describe('a loader receives its context', () => {
    it('params coerced by the constraint: /users/42 with :id(number) gives id 42, a number; no query is {}', async () => {
        const seen: LoaderContext<{ id: number }>[] = [];
        createRouter([
            { path: '/', component: page('home') },
            { path: '/users/:id(number)', component: page('user'), loader: async (ctx: LoaderContext) => { seen.push(ctx as LoaderContext<{ id: number }>); return 1; } },
        ]);
        await tick();
        navigate('/users/42');
        await settle();
        expect(seen).toHaveLength(1);
        expect(seen[0].params).toEqual({ id: 42 });
        expect(typeof seen[0].params.id).toBe('number');
        expect(seen[0].query).toEqual({});
        expect(seen[0].signal).toBeInstanceOf(AbortSignal);
    });

    it('an unconstrained param stays a string, and a repeated query key is an array', async () => {
        const seen: LoaderContext[] = [];
        createRouter([
            { path: '/', component: page('home') },
            { path: '/users/:id', component: page('user'), loader: async (ctx: LoaderContext) => { seen.push(ctx); return 1; } },
        ]);
        await tick();
        navigate('/users/7?tab=a&tab=b&q=x');
        await settle();
        expect(seen[0].params).toEqual({ id: '7' });
        expect(seen[0].query).toEqual({ tab: ['a', 'b'], q: 'x' });
    });

    it('a second navigation aborts the first loader\'s signal', async () => {
        const held = deferred();
        const signals: AbortSignal[] = [];
        createRouter([
            { path: '/', component: page('home') },
            { path: '/slow', component: page('slow'), loader: (ctx: LoaderContext) => { signals.push(ctx.signal); return held.promise; } },
            { path: '/other', component: page('other') },
        ]);
        await tick();
        navigate('/slow');
        await tick();
        expect(signals[0].aborted).toBe(false);
        navigate('/other');
        await tick();
        expect(signals[0].aborted, 'the superseded loader was not told').toBe(true);
        held.resolve('late');
    });

    it('a prefetched call receives the same context', async () => {
        const seen: LoaderContext[] = [];
        createRouter([
            { path: '/', component: page('home') },
            { path: '/users/:id(number)', component: page('user'), loader: async (ctx: LoaderContext) => { seen.push(ctx); return 1; } },
        ]);
        await tick();
        prefetchRoute('/users/9?tab=a');
        await settle();
        expect(seen).toHaveLength(1);
        expect(seen[0].params).toEqual({ id: 9 });
        expect(seen[0].query).toEqual({ tab: 'a' });
        expect(seen[0].signal).toBeInstanceOf(AbortSignal);
    });

    it('a prefetched call a navigation takes over is aborted when that navigation is superseded', async () => {
        const signals: AbortSignal[] = [];
        createRouter([
            { path: '/', component: page('home') },
            { path: '/slow', component: page('slow'), loader: (ctx: LoaderContext) => { signals.push(ctx.signal); return deferred().promise; } },
            { path: '/other', component: page('other') },
        ]);
        await tick();
        prefetchRoute('/slow');
        await settle();
        navigate('/slow');
        await tick();
        expect(signals, 'the navigation called the loader instead of taking the prefetch').toHaveLength(1);
        navigate('/other');
        await tick();
        expect(signals[0].aborted).toBe(true);
    });

    it('a prefetched call that expired unused is aborted as it is dropped', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(0);
        const signals: AbortSignal[] = [];
        createRouter([
            { path: '/', component: page('home') },
            { path: '/slow', component: page('slow'), loader: (ctx: LoaderContext) => { signals.push(ctx.signal); return Promise.resolve(1); } },
        ]);
        await tick();
        prefetchRoute('/slow');
        await settle();
        vi.setSystemTime(10_001);
        navigate('/slow');
        await settle();
        expect(signals).toHaveLength(2);
        expect(signals[0].aborted, 'the expired prefetch was dropped without being told').toBe(true);
        expect(signals[1].aborted).toBe(false);
        vi.useRealTimers();
    });

    it("a child level's loader reads its parent's data, which is published first", async () => {
        let parentSeen: unknown = 'not read';
        createRouter([
            { path: '/', component: page('home') },
            { path: '/tickets/:id', component: page('ticket'), hasOutlet: true, loader: async () => ({ title: 'T1' }) },
            { path: '/tickets/:id/notes', component: page('notes'), loader: async () => { parentSeen = loaderData('/tickets/:id'); return []; } },
        ]);
        await tick();
        navigate('/tickets/1/notes');
        await settle();
        expect(parentSeen).toEqual({ title: 'T1' });
    });

    it('a failing loader leaves its reason in loaderError(path), and a later success clears it', async () => {
        let fail = true;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/data/:n', component: page('data'), loader: async () => { if (fail) throw new Error('down'); return 'ok'; } },
        ]);
        await tick();
        navigate('/data/1');
        await settle();
        expect((loaderError('/data/:n') as Error | null)?.message).toBe('down');
        fail = false;
        navigate('/data/2');
        await settle();
        expect(loaderError('/data/:n')).toBeNull();
    });
});

describe('the execution contract — the route-loader leg', () => {
    it('E1, latest wins: two navigations, the first loader answering last, publish the second\'s data', async () => {
        const answers = new Map<string, ReturnType<typeof deferred>>();
        createRouter([
            { path: '/', component: page('home') },
            { path: '/item/:n', component: page('item'), loader: (ctx: LoaderContext) => {
                const d = deferred(); answers.set(String(ctx.params.n), d); return d.promise;
            } },
        ]);
        await tick();
        navigate('/item/1');
        await tick();
        navigate('/item/2');
        await tick();
        answers.get('2')!.resolve('two');
        await settle();
        answers.get('1')!.resolve('one');
        await settle();
        expect(currentLoaderData()).toBe('two');
    });

    it('E2, a signal per call: the first loader\'s signal is aborted on supersede', async () => {
        const signals: AbortSignal[] = [];
        createRouter([
            { path: '/', component: page('home') },
            { path: '/item/:n', component: page('item'), loader: (ctx: LoaderContext) => { signals.push(ctx.signal); return deferred().promise; } },
        ]);
        await tick();
        navigate('/item/1');
        await tick();
        navigate('/item/2');
        await tick();
        expect(signals.map((s) => s.aborted)).toEqual([true, false]);
    });

    it('a navigation with new params is a new call: the level starts empty, not with the other id\'s data', async () => {
        // «A failed refresh keeps the data» (E4) is about a refresh of the SAME call: the router's is
        // the run behind a kept result (#148), held in loader-cache.test.ts. A navigation to the same
        // route with new params is a new call, whose level has no kept result of its own.
        const second = deferred();
        let calls = 0;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/item/:n', component: page('item'), loader: () => (++calls === 1 ? Promise.resolve('one') : second.promise) },
        ]);
        await tick();
        navigate('/item/1');
        await settle();
        expect(loaderData('/item/:n')).toBe('one');
        navigate('/item/2');
        await tick();
        expect(loaderData('/item/:n'), 'a new call keeps the previous data').toBeUndefined();
        second.reject(new Error('down'));
        await settle();
    });
});
