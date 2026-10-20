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
// A parent that renders a child outlet, and a child whose record is missing (#147).
customElements.define('pdx-ol-ticket', class extends HTMLElement {
    connectedCallback() {
        if (!this.querySelector('pdx-router-outlet')) this.appendChild(document.createElement('pdx-router-outlet'));
    }
});
customElements.define('pdx-ol-note', class extends HTMLElement {});

const calls: string[] = [];
let releaseSlow: (v: unknown) => void = () => {};
let brokenFails = true;

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-ol-home' },
    {
        path: '/users/:id', tag: 'pdx-ol-user',
        loader: async () => { calls.push('user'); return { name: 'Ada' }; },
    },
    { path: '/slow', tag: 'pdx-ol-slow', loader: () => new Promise((r) => { releaseSlow = r; }) },
    { path: '/broken', tag: 'pdx-ol-broken', loader: async () => { if (brokenFails) throw new Error('502'); return 'fixed'; } },
    { path: '/t/:id', tag: 'pdx-ol-ticket', hasOutlet: true, loader: async () => ({ ticket: 1 }) },
    { path: '/t/:id/notes/:n', tag: 'pdx-ol-note', loader: async () => { throw notFound(); } },
];

import { navigate, currentLoaderData, currentLoaderState, currentRoute, notFound } from '../src/runtime';
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
        expect(currentLoaderState()).toBe('success');
    });

    it('the page is mounted, so the data is there when the component renders', () => {
        expect(document.querySelector('pdx-ol-user'), 'the page never rendered').not.toBeNull();
        expect(currentRoute()?.path).toBe('/users/:id');
    });

    it('reports loading while it is in flight', async () => {
        navigate('/slow');
        await tick();

        expect(currentLoaderState(), 'nothing said the page was waiting on data').toBe('pending');
        expect(document.querySelector('pdx-ol-slow'),
            'the page mounted before its data arrived').toBeNull();

        releaseSlow('arrived');
        await tick();

        expect(currentLoaderState()).toBe('success');
        expect(currentLoaderData()).toBe('arrived');
        expect(document.querySelector('pdx-ol-slow')).not.toBeNull();
    });

    it('a loader that throws renders the error page with a retry, not the page (#147)', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        navigate('/broken');
        await tick();

        expect(currentLoaderState()).toBe('error');
        expect(currentLoaderData(), 'a failed loader left the previous page data behind')
            .toBeUndefined();
        expect(document.querySelector('pdx-ol-broken'),
            'the page was mounted as if its loader had not failed').toBeNull();
        const alert = document.querySelector('pdx-router-outlet [role="alert"]');
        expect(alert, 'no error page in the outlet').not.toBeNull();
        const retry = alert!.querySelector('button');
        expect(retry?.textContent, 'the error page offers no retry').toBe('Try again');

        brokenFails = false;
        retry!.click();
        await tick();
        expect(document.querySelector('pdx-ol-broken'), 'the retry did not mount the page').not.toBeNull();
        expect(currentLoaderData()).toBe('fixed');
        expect(document.querySelector('pdx-router-outlet [role="alert"]'), 'the error page stayed').toBeNull();
        err.mockRestore();
    });

    it("a child's notFound() renders the not-found in the child's outlet, and the parent stays (#147)", async () => {
        navigate('/t/1/notes/9');
        await tick();
        await tick();

        const parent = document.querySelector('pdx-ol-ticket');
        expect(parent, 'the parent was taken down with its child').not.toBeNull();
        expect(document.querySelector('pdx-ol-note')).toBeNull();
        const inner = parent!.querySelector('pdx-router-outlet [role="alert"]');
        expect(inner?.getAttribute('aria-label'), "the not-found is not in the child's outlet").toBe('Page not found');
        expect(location.pathname).toBe('/t/1/notes/9');
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
