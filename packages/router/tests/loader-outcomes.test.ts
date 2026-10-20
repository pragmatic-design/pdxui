// A loader's outcome (#147): `throw redirect(to)` and `throw notFound()` from `@pdxui/router`, and any
// other error, decide what the navigation ends on.
//
// - redirect: the router goes to `to` instead, and the target is never published; with `replace` (the
//   default) the abandoned target leaves no history entry;
// - notFound: the not-found page of the LEVEL — the levels above stay, with their data — and the URL
//   is unchanged;
// - any other error: the level's error page, with a retry that runs the navigation, and its loader,
//   again. The page is not mounted as if nothing had happened.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createRouter, destroyRouter, navigate, installRouteTable, registerGuardChecker,
    currentRoute, currentNavError, currentNavErrorDepth, loaderData, loaderError, onAfterNavigate,
    redirect, notFound, retryNavigation,
} from '../src/runtime';
import { resetPrefetch } from '../src/prefetch';
import { resetLoaderPrefetch } from '../src/loader-prefetch';
import { resetLoadQueue } from '../../core/src/renderer/load-queue';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
const page = (name: string) => () => {
    const el = document.createElement('div');
    el.dataset.page = name;
    return el;
};

let quiet: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    destroyRouter();
    installRouteTable(null);
    resetPrefetch();
    resetLoadQueue();
    resetLoaderPrefetch();
    registerGuardChecker(() => true);
    history.replaceState(null, '', '/');
    quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { installRouteTable(null); quiet.mockRestore(); });

describe('throw redirect(to)', () => {
    it("ends at the target, and never publishes the route that redirected", async () => {
        const published: string[] = [];
        const off = onAfterNavigate((_from, to) => { published.push(to); });
        createRouter([
            { path: '/', component: page('home') },
            { path: '/login', component: page('login') },
            { path: '/account', component: page('account'), loader: async () => { throw redirect('/login'); } },
        ]);
        await tick();
        navigate('/account');
        await settle();
        off();
        expect(location.pathname).toBe('/login');
        expect(currentRoute()?.path).toBe('/login');
        expect(published, 'the route that redirected was published before the redirect').not.toContain('/account');
        expect(currentNavError()).toBeNull();
    });

    it('replaces the abandoned entry by default, and keeps it with { replace: false }', async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/login', component: page('login') },
            { path: '/a', component: page('a'), loader: async () => { throw redirect('/login'); } },
            { path: '/b', component: page('b'), loader: async () => { throw redirect('/login', { replace: false }); } },
        ]);
        await tick();
        const start = history.length;
        navigate('/a');
        await settle();
        expect(location.pathname).toBe('/login');
        expect(history.length, 'the abandoned /a kept a history entry').toBe(start + 1);

        navigate('/b');
        await settle();
        expect(location.pathname).toBe('/login');
        expect(history.length, 'with replace: false the abandoned /b keeps its entry').toBe(start + 3);
    });
});

describe('throw notFound()', () => {
    it("renders the level's not-found: the levels above stay with their data, and the URL is unchanged", async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/tickets/:id', component: page('ticket'), hasOutlet: true, loader: async () => ({ ticket: 1 }) },
            { path: '/tickets/:id/notes/:n', component: page('note'), loader: async () => { throw notFound(); } },
        ]);
        await tick();
        navigate('/tickets/1/notes/9');
        await settle();
        expect(location.pathname).toBe('/tickets/1/notes/9');
        expect(currentNavError()).toBe('404');
        expect(currentNavErrorDepth(), 'the not-found belongs to the note, one level down').toBe(1);
        expect(currentRoute()?.path, 'the ticket above it was taken down').toBe('/tickets/:id');
        expect(loaderData('/tickets/:id')).toEqual({ ticket: 1 });
    });

    it('control — a level whose loader succeeds clears it', async () => {
        let missing = true;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/u/:id', component: page('u'), loader: async () => { if (missing) throw notFound(); return 1; } },
        ]);
        await tick();
        navigate('/u/1');
        await settle();
        expect(currentNavError()).toBe('404');
        missing = false;
        navigate('/u/2');
        await settle();
        expect(currentNavError()).toBeNull();
        expect(currentRoute()?.path).toBe('/u/:id');
    });
});

describe('any other error', () => {
    it("renders the level's error page instead of mounting the page, and keeps the reason", async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/broken', component: page('broken'), loader: async () => { throw new Error('502 from the API'); } },
        ]);
        await tick();
        navigate('/broken');
        await settle();
        expect(currentNavError()).toBe('500');
        expect(currentNavErrorDepth()).toBe(0);
        expect(currentRoute(), 'the page was mounted as if nothing had happened').toBeNull();
        expect(loaderError('/broken')?.message).toBe('502 from the API');
        expect(location.pathname).toBe('/broken');
    });

    it('retryNavigation() runs the loader again, and a success publishes the page', async () => {
        let fail = true;
        let calls = 0;
        createRouter([
            { path: '/', component: page('home') },
            { path: '/flaky', component: page('flaky'), loader: async () => { calls++; if (fail) throw new Error('down'); return 'up'; } },
        ]);
        await tick();
        navigate('/flaky');
        await settle();
        expect(currentNavError()).toBe('500');
        const entries = history.length;
        fail = false;
        retryNavigation();
        await settle();
        expect(calls).toBe(2);
        expect(currentNavError()).toBeNull();
        expect(currentRoute()?.path).toBe('/flaky');
        expect(loaderData('/flaky')).toBe('up');
        expect(history.length, 'a retry is not a new history entry').toBe(entries);
    });
});
