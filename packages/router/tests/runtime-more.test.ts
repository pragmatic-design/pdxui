// The navigation lifecycle in runtime.ts.
//
// runtime.test.ts covers resolution: paths in, params out. This file covers everything AROUND a
// navigation — loaders, query state, ephemeral state, popstate, the
// base path, and destroyRouter — which is where a router is either reusable or not.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    createRouter, destroyRouter, navigate,
    currentPath, currentRoute, currentParams, currentQuery, currentSearch, currentState, currentMeta,
    currentLoaderData, currentLoaderState, currentNavError,
    setQuery, setQueryParam, onAfterNavigate,
} from '../src/runtime';
import type { RouteConfig } from '../src/runtime';
import { saveScrollPosition, restoreScrollPosition } from '@pdxui/core';

const tick = () => new Promise((r) => setTimeout(r, 0));
const page = (name: string) => () => {
    const el = document.createElement('div');
    el.dataset.page = name;
    return el;
};

beforeEach(() => {
    destroyRouter();
    history.replaceState(null, '', '/');
});

describe('route loaders', () => {
    it('runs the loader and exposes what it returned', async () => {
        const routes: RouteConfig[] = [
            { path: '/', component: page('home') },
            { path: '/data', component: page('data'), loader: async () => ({ rows: [1, 2] }) },
        ];
        createRouter(routes);

        navigate('/data');
        await tick();

        expect(currentLoaderState()).toBe('done');
        expect(currentLoaderData()).toEqual({ rows: [1, 2] });
        expect(currentRoute()?.path, 'the route resolved only after the loader').toBe('/data');
    });

    it('a loader that throws leaves the route usable and says so', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        createRouter([
            { path: '/', component: page('home') },
            { path: '/bad', component: page('bad'), loader: async () => { throw new Error('500'); } },
        ]);

        navigate('/bad');
        await tick();

        expect(currentLoaderState()).toBe('error');
        expect(currentLoaderData(), 'a failed loader left stale data behind').toBeUndefined();
        expect(currentRoute()?.path, 'a failed loader took the whole page down').toBe('/bad');
        expect(err, 'the failure never reached the console').toHaveBeenCalled();
        err.mockRestore();
    });

    it('clears the loader state for a route that has none', async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/data', component: page('data'), loader: async () => 'payload' },
        ]);
        navigate('/data');
        await tick();
        expect(currentLoaderData()).toBe('payload');

        navigate('/');
        await tick();

        expect(currentLoaderState(), 'the previous page kept the loader state busy').toBe('idle');
        expect(currentLoaderData(), 'the next page could read the previous page data')
            .toBeUndefined();
    });

    it('a superseded loader result never lands', async () => {
        let releaseSlow: (v: string) => void = () => {};
        createRouter([
            { path: '/slow', component: page('slow'), loader: () => new Promise<string>((r) => { releaseSlow = r; }) },
            { path: '/fast', component: page('fast'), loader: async () => 'fast-data' },
        ]);

        navigate('/slow');
        await tick();
        navigate('/fast');
        await tick();
        releaseSlow('slow-data');       // answers after the newer navigation won
        await tick();

        expect(currentLoaderData(), 'a stale loader overwrote the current page data')
            .toBe('fast-data');
        expect(currentPath()).toBe('/fast');
    });
});

describe('query state', () => {
    it('setQuery replaces the whole string, in the URL and in the signals', () => {
        createRouter([{ path: '/', component: page('home') }]);

        setQuery({ page: '2', sort: 'name' });

        expect(currentQuery()).toEqual({ page: '2', sort: 'name' });
        expect(currentSearch()).toBe('?page=2&sort=name');
        expect(location.search).toBe('?page=2&sort=name');
    });

    it('setQueryParam adds one without disturbing the others', () => {
        createRouter([{ path: '/', component: page('home') }]);
        setQuery({ page: '2' });

        setQueryParam('sort', 'name');

        expect(currentQuery()).toEqual({ page: '2', sort: 'name' });
    });

    it('setQueryParam(null) removes one', () => {
        createRouter([{ path: '/', component: page('home') }]);
        setQuery({ page: '2', sort: 'name' });

        setQueryParam('sort', null);

        expect(currentQuery()).toEqual({ page: '2' });
        expect(location.search).toBe('?page=2');
    });

    it('removing the last param leaves a bare path, not a dangling "?"', () => {
        createRouter([{ path: '/', component: page('home') }]);
        setQuery({ only: 'one' });

        setQueryParam('only', null);

        expect(location.search).toBe('');
        expect(location.pathname).toBe('/');
    });

    it('a navigation parses the query out of the URL', async () => {
        // Through popstate, not navigate(): navigate builds the URL from the path it is given and
        // would drop a query the caller did not put there. Arriving on a URL that already has one
        // — a deep link, a back button — is how a query reaches the router.
        createRouter([
            { path: '/', component: page('home') },
            { path: '/list', component: page('list') },
        ]);

        history.pushState(null, '', '/list?q=hello&page=3');
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
        await tick();

        expect(currentPath()).toBe('/list');
        expect(currentQuery()).toEqual({ q: 'hello', page: '3' });
        expect(currentSearch()).toBe('?q=hello&page=3');
    });
});

describe('ephemeral navigation state', () => {
    it('travels with the navigation without appearing in the URL', async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/detail', component: page('detail') },
        ]);

        navigate('/detail', undefined, { from: 'the-list' });
        await tick();

        expect(currentState()).toEqual({ from: 'the-list' });
        expect(location.search, 'ephemeral state leaked into the URL').toBe('');
    });

    it('is cleared by a navigation that carries none', async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/detail', component: page('detail') },
        ]);
        navigate('/detail', undefined, { from: 'x' });
        await tick();

        navigate('/');
        await tick();

        expect(currentState(), 'the next page could read the previous page state').toBeUndefined();
    });
});

describe('route metadata', () => {
    it('is exposed for the matched route and cleared on a miss', async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/admin', component: page('admin'), meta: { title: 'Admin', layout: 'wide' } },
        ]);

        navigate('/admin');
        await tick();
        expect(currentMeta()).toEqual({ title: 'Admin', layout: 'wide' });

        navigate('/nowhere');
        await tick();
        expect(currentMeta(), 'the metadata of the previous page survived a 404').toBeUndefined();
        expect(currentNavError()).toBe('404');
    });
});

describe('the back button', () => {
    it('a popstate re-resolves the route and restores the state of that entry', async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/a', component: page('a') },
        ]);

        history.pushState({ marker: 'from-history' }, '', '/a');
        window.dispatchEvent(new PopStateEvent('popstate', { state: { marker: 'from-history' } }));
        await tick();

        expect(currentPath(), 'the back button did not re-resolve the route').toBe('/a');
        expect(currentState()).toEqual({ marker: 'from-history' });
    });

    it('a popstate with no state clears it rather than keeping the last one', async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/a', component: page('a') },
        ]);
        navigate('/a', undefined, { marker: 'live' });
        await tick();

        history.replaceState(null, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
        await tick();

        expect(currentState()).toBeUndefined();
        expect(currentPath()).toBe('/');
    });
});

describe('destroyRouter', () => {
    it('stops the listeners, so a torn-down router ignores the back button', async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/a', component: page('a') },
        ]);
        navigate('/a');
        await tick();

        destroyRouter();
        history.replaceState(null, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
        await tick();

        expect(currentPath(), 'a destroyed router still answered history events').toBe('/a');
    });

    it('is safe to call twice, and with no router at all', () => {
        expect(() => { destroyRouter(); destroyRouter(); }).not.toThrow();
    });

    it('a second createRouter does not stack listeners', async () => {
        const seen: string[] = [];
        createRouter([{ path: '/', component: page('home') }, { path: '/a', component: page('a') }]);
        createRouter([{ path: '/', component: page('home') }, { path: '/a', component: page('a') }]);
        const off = onAfterNavigate((_from, to) => seen.push(to));

        history.replaceState(null, '', '/a');
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
        await tick();

        expect(seen, 'the previous router was still listening').toEqual(['/a']);
        off();
    });
});

describe('the base path', () => {
    it('is stripped from what the routes see and added back to the URL', async () => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/about', component: page('about') },
        ], { basePath: '/app' });

        navigate('/about');
        await tick();

        expect(currentPath(), 'the route table should never see the base path').toBe('/about');
        expect(location.pathname, 'the address bar lost the base path').toBe('/app/about');

        createRouter([{ path: '/', component: page('home') }]);   // reset the base for later files
    });
});

describe('scroll restoration belongs to core', () => {
    // Behavioural, not a grep: if the router kept its own Map, core would know nothing about
    // a position the router saved, and restoring through core would leave the page where it was.
    // One shared state, because copies of one behaviour drift: a fix for a malformed hash lands in
    // some of them and not the others.
    it('a position the router saved is restorable through core', async () => {
        createRouter([
            { path: '/a', component: page('a') },
            { path: '/b', component: page('b') },
        ]);
        navigate('/a');
        await tick();
        window.scrollTo(0, 300);

        navigate('/b');          // leaving /a is what saves its position
        await tick();
        expect(window.scrollY, 'a forward navigation starts at the top').toBe(0);

        restoreScrollPosition('/a', true);
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        expect(window.scrollY, 'the router and core do not share the same positions').toBe(300);
    });

    it('and a position core saved is restored by the router', async () => {
        createRouter([
            { path: '/a', component: page('a') },
            { path: '/b', component: page('b') },
        ]);
        navigate('/b');
        await tick();

        window.scrollTo(0, 175);
        saveScrollPosition('/a');

        history.replaceState(null, '', '/a');
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
        await tick();
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        expect(window.scrollY, 'the back button ignored a position core had saved').toBe(175);
    });
});

describe('a trailing slash', () => {
    // The parity table has the row that matters (both routers, one behaviour). These are the edges
    // it does not name — and the root guard, which is the reason the normalisation is not a plain
    // trim.
    beforeEach(() => {
        createRouter([
            { path: '/', component: page('home') },
            { path: '/about', component: page('about') },
            { path: '/users/:id', component: page('user') },
        ]);
    });

    it('resolves the same route as without it', async () => {
        navigate('/about/');
        await tick();
        expect(currentRoute()?.path, 'a copy-pasted URL with a slash was a 404').toBe('/about');
    });

    it('does not eat the root — "/" must not become ""', async () => {
        navigate('/');
        await tick();
        expect(currentRoute()?.path).toBe('/');
    });

    it('works for a dynamic route too, and the param excludes the slash', async () => {
        navigate('/users/7/');
        await tick();
        expect(currentRoute()?.path).toBe('/users/:id');
        expect(currentParams(), 'the trailing slash ended up inside the param').toEqual({ id: '7' });
    });

    it('leaves currentPath as the address bar holds it', async () => {
        // Only the MATCH is normalised. The generated router does the same: it normalises inside
        // resolve() and stores the raw pathname, so a link built from currentPath() is unchanged.
        navigate('/about/');
        await tick();
        expect(currentPath()).toBe('/about/');
    });

    it('still 404s a path that is genuinely not a route', async () => {
        navigate('/nothing/');
        await tick();
        expect(currentRoute(), 'the normalisation made everything match').toBeNull();
        expect(currentNavError()).toBe('404');
    });
});

describe('navigate refuses what is not a route', () => {
    it('an external https URL is refused, not handed to pushState', async () => {
        // sanitizeUrl says https is fine — it is, in an href. In navigate() it reached
        // history.pushState with a cross-origin URL, which throws an unhandled SecurityError
        // from inside whatever click handler called it.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createRouter([{ path: '/', component: page('home') }]);
        const before = currentPath();

        expect(() => navigate('https://evil.example/steal')).not.toThrow();
        await tick();

        expect(currentPath(), 'navigate() accepted an off-origin target').toBe(before);
        expect(location.href, 'the address bar was written before the refusal')
            .not.toContain('evil.example');
        expect(warn.mock.calls.some((c) => String(c[0]).includes('Refused to navigate')),
            'the refusal left no trace to diagnose').toBe(true);
        warn.mockRestore();
    });

    it('a same-origin absolute URL is refused too — it is not a route', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createRouter([{ path: '/', component: page('home') }]);
        const before = currentPath();

        navigate(`${location.origin}/a`);
        await tick();

        expect(currentPath()).toBe(before);
        warn.mockRestore();
    });

    it('a javascript: target does not either', async () => {
        createRouter([{ path: '/', component: page('home') }]);
        const before = currentPath();

        navigate('javascript:alert(1)');
        await tick();

        expect(currentPath()).toBe(before);
    });
});
