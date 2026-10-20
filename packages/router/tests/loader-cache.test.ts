// A route loader's results are kept in core's cache (#148), per call identity
// (`pattern | own params | canonical query`), tagged `loader:<pattern>`.
//
// - a level entered again within `staleTime` takes the kept result and does not run its loader;
// - after it, the kept result is shown at once, `stale()` true, while the loader runs again;
// - two queries are two calls, two entries;
// - a level that stays mounted, with its key unchanged, is not run again — `staleTime: 0` included;
// - `invalidate(['loader:<pattern>'])` drops every key of the pattern, and a mounted level whose key
//   it dropped runs again at once, keeping its result on screen meanwhile.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCache, setDefaultCache, invalidate } from '@pdxui/core';
import {
    createRouter, destroyRouter, navigate, installRouteTable, registerGuardChecker,
    currentRoute, loaderData, loaderSource,
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

let now = 1_000_000;
beforeEach(() => {
    destroyRouter();
    installRouteTable(null);
    resetPrefetch();
    resetLoadQueue();
    resetLoaderPrefetch();
    setDefaultCache(createCache({ gcInterval: 0 }));
    registerGuardChecker(() => true);
    history.replaceState(null, '', '/');
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => { installRouteTable(null); vi.restoreAllMocks(); });

describe('a level entered again', () => {
    it('within staleTime takes the kept result, and runs its loader zero times', async () => {
        let calls = 0;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/list', component: page('list'), loaderStaleTime: 30_000, loader: async () => ++calls },
            { path: '/other', component: page('other') },
        ]);
        await tick();
        navigate('/list');
        await settle();
        navigate('/other');
        await settle();
        now += 10_000;
        navigate('/list');
        await settle();
        expect(calls, 'the kept result was not used').toBe(1);
        expect(loaderData('/list')).toBe(1);
        expect(loaderSource('/list').stale()).toBe(false);
    });

    it('after staleTime shows the kept result at once, stale, while the loader runs again', async () => {
        let calls = 0;
        let release: (v: number) => void = () => {};
        createRouter([
            { path: '/', component: page('home') },
            { path: '/list', component: page('list'), loaderStaleTime: 30_000, loader: () => new Promise<number>((r) => { calls++; release = r; }) },
            { path: '/other', component: page('other') },
        ]);
        await tick();
        navigate('/list');
        await settle();
        release(1);
        await settle();
        navigate('/other');
        await settle();
        now += 31_000;
        navigate('/list');
        await settle();
        const list = loaderSource('/list');
        expect(currentRoute()?.path, 'the page waited for the loader with a result in hand').toBe('/list');
        expect(list.data()).toBe(1);
        expect(list.stale()).toBe(true);
        expect(list.pending()).toBe(true);
        expect(calls).toBe(2);
        release(2);
        await settle();
        expect(list.data()).toBe(2);
        expect(list.stale()).toBe(false);
        expect(list.state()).toBe('success');
    });

    it('a run behind a kept result that fails keeps the result on screen, and says why (E4)', async () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
        let fail = false;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/list', component: page('list'), loader: async () => { if (fail) throw new Error('down'); return 'kept'; } },
            { path: '/other', component: page('other') },
        ]);
        await tick();
        navigate('/list');
        await settle();
        navigate('/other');
        await settle();
        fail = true;
        navigate('/list');
        await settle();
        const list = loaderSource('/list');
        expect(currentRoute()?.path, 'a failed refresh took the page down').toBe('/list');
        expect(list.data()).toBe('kept');
        expect(list.state()).toBe('error');
        expect(list.error()?.message).toBe('down');
        quiet.mockRestore();
    });

    it('with the default staleTime of 0, always runs again, showing the kept result meanwhile', async () => {
        let calls = 0;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/list', component: page('list'), loader: async () => ++calls },
            { path: '/other', component: page('other') },
        ]);
        await tick();
        navigate('/list');
        await settle();
        navigate('/other');
        await settle();
        navigate('/list');
        await settle();
        expect(calls).toBe(2);
        expect(loaderData('/list')).toBe(2);
    });
});

describe('a prefetched result', () => {
    it('enters the cache under the same key: a navigation within staleTime runs nothing more', async () => {
        let calls = 0;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/list', component: page('list'), loaderStaleTime: 30_000, loader: async () => ++calls },
        ]);
        await tick();
        prefetchRoute('/list');
        await settle();
        now += 20_000; // past the prefetch's own ten seconds, within the loader's staleTime
        navigate('/list');
        await settle();
        expect(calls, 'the prefetched result was not kept').toBe(1);
        expect(loaderData('/list')).toBe(1);
    });
});

describe('the identity of a call', () => {
    it('two queries are two entries', async () => {
        const seen: string[] = [];
        createRouter([
            { path: '/', component: page('home') },
            { path: '/search', component: page('search'), loaderStaleTime: 30_000, loader: async (ctx: LoaderContext) => { seen.push(String(ctx.query.q)); return ctx.query.q; } },
        ]);
        await tick();
        navigate.url('/search?q=alice');
        await settle();
        navigate.url('/search?q=bob');
        await settle();
        expect(loaderData('/search'), "bob's search returned alice's result").toBe('bob');
        navigate.url('/search?q=alice');
        await settle();
        expect(seen, 'a kept result was not taken, or two queries shared one').toEqual(['alice', 'bob']);
        expect(loaderData('/search')).toBe('alice');
    });

    it("a parent level's loader runs once across navigations between its children, staleTime 0", async () => {
        let parent = 0;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/t/:id', component: page('t'), hasOutlet: true, loader: async () => ++parent },
            { path: '/t/:id/a', component: page('a') },
            { path: '/t/:id/b', component: page('b') },
        ]);
        await tick();
        navigate('/t/1/a');
        await settle();
        navigate('/t/1/b');
        await settle();
        navigate('/t/1/a');
        await settle();
        expect(parent, 'a mounted level whose key did not change ran again').toBe(1);
    });
});

describe("invalidate(['loader:<pattern>'])", () => {
    it('drops every key of the pattern, and runs a mounted level again at once, keeping its result meanwhile', async () => {
        const calls: string[] = [];
        let release: (v: string) => void = () => {};
        createRouter([
            { path: '/', component: page('home') },
            {
                path: '/users/:id', component: page('user'), loaderStaleTime: 60_000,
                loader: (ctx: LoaderContext) => new Promise<string>((r) => { calls.push(String(ctx.params.id)); release = r; }),
            },
        ]);
        await tick();
        navigate('/users/1');
        await settle();
        release('u1');
        await settle();
        navigate('/users/2');
        await settle();
        release('u2');
        await settle();
        navigate('/users/1');
        await settle();
        expect(calls, 'the kept result of /users/1 was not taken').toEqual(['1', '2']);

        invalidate(['loader:/users/:id']);
        await settle();
        expect(calls, 'the mounted level did not run again').toEqual(['1', '2', '1']);
        const user = loaderSource('/users/:id');
        expect(user.data(), 'the mounted level lost its result while it reloads').toBe('u1');
        expect(user.stale()).toBe(true);
        release('u1b');
        await settle();
        expect(user.data()).toBe('u1b');
        expect(user.stale()).toBe(false);

        navigate('/users/2');
        await settle();
        expect(calls, "the other key of the pattern was not dropped").toEqual(['1', '2', '1', '2']);
    });

    it('control — a tag of another pattern drops nothing', async () => {
        let calls = 0;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/users/:id', component: page('user'), loaderStaleTime: 60_000, loader: async () => ++calls },
        ]);
        await tick();
        navigate('/users/1');
        await settle();
        invalidate(['loader:/orders/:id']);
        await settle();
        expect(calls).toBe(1);
    });
});
