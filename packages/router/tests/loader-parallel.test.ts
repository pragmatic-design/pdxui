// A navigation starts a level's chunk and its loader together, and a prefetch loads the data (#119).
//
// Before, the loader was reached through the page module: the table's bridge imported the page,
// then called the loader it registered, and the outlet imported the page again once the route was
// published. Code and data arrived one after the other — on a real network, one round trip each.
// Now every level's chunk import starts when the guards have let the navigation through, beside
// the loaders, and a level settles when both have.
//
// A prefetch under the `hover` or `viewport` policy starts the target's loader too, keyed by the
// loader call's identity — `pattern | own params | canonical query` — and a navigation within ten
// seconds with the same key takes the result instead of calling the loader again. A guard is asked
// first: a prefetch never calls the loader of a route the visitor may not enter.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createRouter, destroyRouter, navigate, installRouteTable, registerGuardChecker,
    currentRoute, currentLoaderData,
} from '../src/runtime';
import type { RouteConfig } from '../src/runtime';
import { prefetchRoute, resetPrefetch } from '../src/prefetch';
import { resetLoaderPrefetch } from '../src/loader-prefetch';
import { resetLoadQueue } from '../../core/src/renderer/load-queue';

const tick = () => new Promise((r) => setTimeout(r, 0));
const page = (name: string) => () => {
    const el = document.createElement('div');
    el.dataset.page = name;
    return el;
};

/** A promise the test settles by hand, and whether it was started. */
function deferred<T = unknown>(): { promise: Promise<T>; resolve: (v: T) => void } {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
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

afterEach(() => {
    installRouteTable(null);
    vi.useRealTimers();
});

describe('a navigation to a route with a loader', () => {
    it('starts the page chunk and the loader in the same tick', async () => {
        const started: string[] = [];
        const chunk = deferred();
        const data = deferred();
        installRouteTable({ routes: [], pageModules: { '/data': () => { started.push('chunk'); return chunk.promise; } } });
        createRouter([
            { path: '/', component: page('home') },
            { path: '/data', component: page('data'), loader: () => { started.push('loader'); return data.promise; } },
        ]);
        await tick();

        navigate('/data');
        await Promise.resolve();
        await Promise.resolve();

        // Before #119 only the loader had started: the chunk waited for the route to be published.
        expect(started.sort(), 'the chunk and the loader did not start together').toEqual(['chunk', 'loader']);
    });

    it('publishes the level when both the chunk and the data are in, not when one is', async () => {
        const chunk = deferred();
        const data = deferred<{ rows: number[] }>();
        installRouteTable({ routes: [], pageModules: { '/data': () => chunk.promise } });
        createRouter([
            { path: '/', component: page('home') },
            { path: '/data', component: page('data'), loader: () => data.promise },
        ]);
        await tick();

        navigate('/data');
        data.resolve({ rows: [1] });
        await tick();
        expect(currentRoute()?.path, 'the route was published before its chunk arrived').toBe('/');

        chunk.resolve({});
        await tick();
        expect(currentRoute()?.path).toBe('/data');
        expect(currentLoaderData()).toEqual({ rows: [1] });
    });

    it('starts every level\'s chunk at once, while the outer loader is still running', async () => {
        const started: string[] = [];
        const parentData = deferred();
        installRouteTable({
            routes: [],
            pageModules: {
                '/tickets/:id': () => { started.push('parent chunk'); return Promise.resolve({}); },
                '/tickets/:id/notes': () => { started.push('child chunk'); return Promise.resolve({}); },
            },
        });
        createRouter([
            { path: '/', component: page('home') },
            { path: '/tickets/:id', component: page('ticket'), hasOutlet: true, loader: () => parentData.promise },
            { path: '/tickets/:id/notes', component: page('notes'), loader: async () => 'notes' },
        ]);
        await tick();

        navigate('/tickets/1/notes');
        await tick();
        // Chunks do not depend on each other; loaders do (a child may read its parent's data).
        expect(started, 'the child chunk waited for the parent loader').toEqual(['parent chunk', 'child chunk']);
        parentData.resolve('ticket');
        await tick();
        expect(currentRoute()?.path).toBe('/tickets/:id/notes');
    });

    it('control — a route with no loader still resolves in the same task', async () => {
        installRouteTable({ routes: [], pageModules: { '/plain': () => Promise.resolve({}) } });
        createRouter([{ path: '/', component: page('home') }, { path: '/plain', component: page('plain') }]);
        await tick();
        navigate('/plain');
        expect(currentRoute()?.path, 'a navigation with nothing to load became asynchronous').toBe('/plain');
    });
});

describe('a prefetch loads the data too', () => {
    function dataRoutes(loader: () => Promise<unknown>, extra: Partial<RouteConfig> = {}): void {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/data', component: page('data'), loader, ...extra },
        ]);
    }

    it('hover then click calls the loader once', async () => {
        const loader = vi.fn(async () => ({ rows: [7] }));
        dataRoutes(loader);
        await tick();

        prefetchRoute('/data');
        await tick();
        expect(loader, 'the prefetch did not start the loader').toHaveBeenCalledTimes(1);

        navigate('/data');
        await tick();
        expect(loader, 'the navigation called the loader again').toHaveBeenCalledTimes(1);
        expect(currentLoaderData()).toEqual({ rows: [7] });
    });

    it('two links whose queries differ only in order share one prefetch', async () => {
        const loader = vi.fn(async () => 'x');
        dataRoutes(loader);
        await tick();

        prefetchRoute('/data?a=1&b=2');
        prefetchRoute('/data?b=2&a=1');
        await tick();
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it('a different query value is a different call', async () => {
        const loader = vi.fn(async () => 'x');
        dataRoutes(loader);
        await tick();

        prefetchRoute('/data?q=alice');
        prefetchRoute('/data?q=bob');
        await tick();
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('never calls the loader of a route the visitor may not enter', async () => {
        const loader = vi.fn(async () => 'secret');
        registerGuardChecker((name) => name !== 'admin');
        dataRoutes(loader, { guard: 'admin' });
        await tick();

        prefetchRoute('/data');
        await tick();
        expect(loader, 'a prefetch ran a guarded loader').not.toHaveBeenCalled();
    });

    it('a prefetched result older than ten seconds is not used', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(0);
        const loader = vi.fn(async () => 'x');
        dataRoutes(loader);
        await tick();

        prefetchRoute('/data');
        await tick();
        vi.setSystemTime(10_001);
        navigate('/data');
        await tick();
        expect(loader, 'a stale prefetch stood in for the loader').toHaveBeenCalledTimes(2);
    });

    it('a route that prefetches eagerly or never does not prefetch its data', async () => {
        const loader = vi.fn(async () => 'x');
        // `prefetch` is in every table the compiler writes; `TableRoute` leaves it to the readers.
        const routes = [{ path: '/data', tag: 'pdx-data', prefetch: 'eager' }];
        installRouteTable({ routes });
        dataRoutes(loader);
        await tick();

        prefetchRoute('/data');
        await tick();
        expect(loader).not.toHaveBeenCalled();
    });
});
