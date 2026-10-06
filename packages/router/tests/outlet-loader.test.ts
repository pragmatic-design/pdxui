// The outlet carries `loader` into the RouteConfigs it builds, or a route never has one.
//
// The chain: the compiler emits the loader into `__pdx_routes`, the outlet maps those entries into
// the RouteConfig list `createRouter` receives, and the runtime awaits `config.loader()`. If the
// outlet's map drops this field, the runtime's loader code is unreachable,
// `currentLoaderState()` never leaves 'idle', and the documented example renders a page with no
// data and no error.

import { describe, it, expect, beforeAll, vi } from 'vitest';

customElements.define('pdx-ol-home', class extends HTMLElement {});
customElements.define('pdx-ol-user', class extends HTMLElement {});
customElements.define('pdx-ol-slow', class extends HTMLElement {});
customElements.define('pdx-ol-broken', class extends HTMLElement {});

const calls: string[] = [];
let releaseSlow: (v: unknown) => void = () => {};

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-ol-home' },
    {
        path: '/users/:id', tag: 'pdx-ol-user',
        loader: async () => { calls.push('user'); return { name: 'Ada' }; },
    },
    { path: '/slow', tag: 'pdx-ol-slow', loader: () => new Promise((r) => { releaseSlow = r; }) },
    { path: '/broken', tag: 'pdx-ol-broken', loader: async () => { throw new Error('502'); } },
];

import { navigate, currentLoaderData, currentLoaderState, currentRoute } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
    history.replaceState(null, '', '/');
    document.body.appendChild(document.createElement('pdx-router-outlet'));
    await tick();
});

describe('a route loader declared on a @page', () => {
    it('runs, and its result reaches currentLoaderData', async () => {
        navigate('/users/7');
        await tick();

        expect(calls, 'the loader was never called — the outlet dropped it').toEqual(['user']);
        expect(currentLoaderData()).toEqual({ name: 'Ada' });
        expect(currentLoaderState()).toBe('done');
    });

    it('the page is mounted, so the data is there when the component renders', () => {
        expect(document.querySelector('pdx-ol-user'), 'the page never rendered').not.toBeNull();
        expect(currentRoute()?.path).toBe('/users/:id');
    });

    it('reports loading while it is in flight', async () => {
        navigate('/slow');
        await tick();

        expect(currentLoaderState(), 'nothing said the page was waiting on data').toBe('loading');
        expect(document.querySelector('pdx-ol-slow'),
            'the page mounted before its data arrived').toBeNull();

        releaseSlow('arrived');
        await tick();

        expect(currentLoaderState()).toBe('done');
        expect(currentLoaderData()).toBe('arrived');
        expect(document.querySelector('pdx-ol-slow')).not.toBeNull();
    });

    it('a loader that throws leaves the page usable and says so', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        navigate('/broken');
        await tick();

        expect(currentLoaderState()).toBe('error');
        expect(currentLoaderData(), 'a failed loader left the previous page data behind')
            .toBeUndefined();
        expect(document.querySelector('pdx-ol-broken'),
            'a failed loader took the whole page down').not.toBeNull();
        err.mockRestore();
    });

    it('a route with no loader resets the state — the next page reads no stale data', async () => {
        navigate('/');
        await tick();

        expect(currentLoaderState()).toBe('idle');
        expect(currentLoaderData()).toBeUndefined();
    });

    it('runs again on the next navigation to the same route', async () => {
        calls.length = 0;
        navigate('/users/9');
        await tick();

        expect(calls, 'a second visit reused the first visit data').toEqual(['user']);
    });
});
