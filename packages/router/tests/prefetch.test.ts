// `@prefetch` fetches the route's chunk.
//
// Appending `<link rel="prefetch" href="/settings">` is not a prefetch: in a single-page app it asks
// the server for the SPA fallback, `index.html`, a document the router will never navigate to. The
// route's JavaScript is not fetched, so the first click on a split route stalls all the same.
//
// What actually prefetches a route is calling its `import()` early, which is why these assertions
// count LOADER CALLS and not `<link>` elements.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Which route patterns the fake generated router was asked to load. */
const loaded: string[] = [];

vi.mock('../src/active', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('../src/active');
    return {
        ...actual,
        routeTable: () => (globalThis as { __pdx_table?: unknown[] }).__pdx_table ?? null,
        pageModule: (path: string) => {
            const known = ['/tickets/:id', '/reports', '/admin', '/', '/broken'];
            if (!known.includes(path)) return undefined;
            if (path === '/broken') return () => { loaded.push(path); return Promise.reject(new Error('offline')); };
            return () => { loaded.push(path); return Promise.resolve({}); };
        },
    };
});

const { prefetchRoute, policyFor, routeFor, prefetchAllowed, resetPrefetch, prefetchedLoad } = await import('../src/prefetch');

type Conn = { saveData?: boolean; effectiveType?: string } | undefined;
function setConnection(conn: Conn): void {
    Object.defineProperty(navigator, 'connection', { value: conn, configurable: true });
}

const TABLE = [
    { path: '/', tag: 'pdx-home' },
    { path: '/tickets/:id', tag: 'pdx-ticket' },
    { path: '/reports', tag: 'pdx-reports', prefetch: 'eager' },
    { path: '/admin', tag: 'pdx-admin', prefetch: 'never' },
    { path: '/settings', tag: 'pdx-settings' },   // in the entry: no chunk to fetch
    { path: '/broken', tag: 'pdx-broken' },       // a chunk the network will not deliver
];

beforeEach(() => {
    (globalThis as { __pdx_table?: unknown[] }).__pdx_table = TABLE;
    loaded.length = 0;
    resetPrefetch();
    setConnection(undefined);
});

afterEach(() => {
    delete (globalThis as { __pdx_table?: unknown[] }).__pdx_table;
});

describe('which route a URL belongs to', () => {
    it('matches a literal path', () => {
        expect(routeFor('/reports')?.path).toBe('/reports');
    });

    it('matches a param segment, whatever is in it', () => {
        expect(routeFor('/tickets/42')?.path).toBe('/tickets/:id');
        expect(routeFor('/tickets/not-a-number')?.path).toBe('/tickets/:id');
    });

    it('does not match a different number of segments', () => {
        // `/tickets/1/interventions/2` is a route of its own, or nothing. It is not `/tickets/:id`.
        expect(routeFor('/tickets/1/interventions/2')).toBeUndefined();
    });

    it('ignores the query and the fragment', () => {
        expect(routeFor('/reports?range=30d#top')?.path).toBe('/reports');
    });

    it('and refuses anything that is not a path of ours', () => {
        // An external href on a <pdx-link> is not this router's route, and a `javascript:` URL is
        // not anything at all. Neither may be looked up, let alone fetched.
        expect(routeFor('https://example.com/reports')).toBeUndefined();
        expect(routeFor('javascript:alert(1)')).toBeUndefined();
    });
});

describe('fetching the chunk', () => {
    it('loads the module for the route behind the URL', () => {
        expect(prefetchRoute('/tickets/42'), 'nothing was fetched').toBe(true);
        expect(loaded).toEqual(['/tickets/:id']);
    });

    it('once per ROUTE, not once per URL', () => {
        prefetchRoute('/tickets/1');
        prefetchRoute('/tickets/2');
        prefetchRoute('/tickets/1');
        expect(loaded, 'the same chunk was fetched more than once').toEqual(['/tickets/:id']);
    });

    it('and a route with no chunk is not a failure, only nothing to do', () => {
        // `/settings` is in the entry — a `preload: true` page, or dev, where every page is already
        // imported. There is no loader, and asking again later will not produce one.
        expect(prefetchRoute('/settings')).toBe(false);
        expect(loaded).toEqual([]);
    });

    it('a URL that matches no route fetches nothing', () => {
        expect(prefetchRoute('/nowhere')).toBe(false);
        expect(loaded).toEqual([]);
    });
});

// The outlet AWAITS a load a prefetch started instead of starting a second one: a second `import()`
// does not wait for the stylesheet the first is fetching, and the page would paint unstyled and then
// move.
describe('the load a prefetch started, for the outlet to wait on', () => {
    it('is kept, by route pattern', async () => {
        prefetchRoute('/tickets/42');
        const pending = prefetchedLoad('/tickets/:id');
        expect(pending, 'the prefetch left nothing for the outlet to wait on').toBeInstanceOf(Promise);
        await expect(pending).resolves.toEqual({});
    });

    it('control — without a prefetch there is nothing, and the outlet loads on its own', () => {
        expect(prefetchedLoad('/tickets/:id')).toBeUndefined();
    });

    it('and a failed one is forgotten, so the outlet starts its own load', async () => {
        prefetchRoute('/broken');
        await expect(prefetchedLoad('/broken')).rejects.toThrow('offline');
        await Promise.resolve();
        expect(prefetchedLoad('/broken'), 'a failed prefetch would fail the page too').toBeUndefined();
    });
});

describe('the policy the route declares', () => {
    it('defaults to hover when it declares nothing', () => {
        expect(policyFor('/tickets/7')).toBe('hover');
    });

    it('reads eager and never off the route', () => {
        expect(policyFor('/reports')).toBe('eager');
        expect(policyFor('/admin')).toBe('never');
    });

    it("and `never` is obeyed, which is the point of it", () => {
        // A route behind a permission the visitor does not have must not be fetched to find out.
        expect(prefetchRoute('/admin')).toBe(false);
        expect(loaded).toEqual([]);
    });
});

describe('not on a connection that is paying for it', () => {
    it('off when the visitor asked to save data', () => {
        setConnection({ saveData: true, effectiveType: '4g' });
        expect(prefetchAllowed()).toBe(false);
        expect(prefetchRoute('/tickets/1')).toBe(false);
        expect(loaded).toEqual([]);
    });

    it('off on 2g, where a speculative download competes with the page being read', () => {
        setConnection({ effectiveType: '2g' });
        expect(prefetchRoute('/tickets/1')).toBe(false);
        setConnection({ effectiveType: 'slow-2g' });
        expect(prefetchRoute('/tickets/1')).toBe(false);
        expect(loaded).toEqual([]);
    });

    it('on when the browser does not report a connection at all', () => {
        // The absence of the Network Information API is not a slow connection, and reading it as
        // one would turn the feature off in every browser but Chromium.
        setConnection(undefined);
        expect(prefetchAllowed()).toBe(true);
        expect(prefetchRoute('/tickets/1')).toBe(true);
    });

    it('and on at 4g', () => {
        setConnection({ saveData: false, effectiveType: '4g' });
        expect(prefetchRoute('/tickets/1')).toBe(true);
        expect(loaded).toEqual(['/tickets/:id']);
    });
});
