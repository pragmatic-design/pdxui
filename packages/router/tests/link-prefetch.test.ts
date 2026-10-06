// A link fetches the chunk of the route it points at.
//
// A `<link rel="prefetch" href="/dest">` would not: in a single-page app it asks the server for the
// SPA fallback — `index.html` — a document the router will never navigate to, and never for the
// route's JavaScript. A split route would still stall on its first click, with a declaration on it
// saying it would not.
//
// These assertions count LOADER CALLS. They are also where the triggers live: hover is the obvious
// one, focus is the keyboard's, and `pointerdown` is the only one a touch device has — it fires
// before the click, which is the whole margin there is on a phone.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const loaded: string[] = [];

vi.mock('../src/active', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('../src/active');
    return {
        ...actual,
        routeTable: () => (globalThis as { __pdx_table?: unknown[] }).__pdx_table ?? null,
        pageModule: (path: string) => {
            if (!['/dest', '/eagerly', '/admin'].includes(path)) return undefined;
            return () => { loaded.push(path); return Promise.resolve({}); };
        },
    };
});

await import('../src/link');
const { resetPrefetch } = await import('../src/prefetch');

const TABLE = [
    { path: '/', tag: 'pdx-home' },
    { path: '/dest', tag: 'pdx-dest' },
    { path: '/eagerly', tag: 'pdx-eager', prefetch: 'eager' },
    { path: '/admin', tag: 'pdx-admin', prefetch: 'never' },
];

function link(attrs: Record<string, string>): HTMLElement {
    const el = document.createElement('pdx-link');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.textContent = 'go';
    document.body.appendChild(el);
    return el;
}

beforeEach(() => {
    (globalThis as { __pdx_table?: unknown[] }).__pdx_table = TABLE;
    document.body.innerHTML = '';
    loaded.length = 0;
    resetPrefetch();
});

afterEach(() => {
    delete (globalThis as { __pdx_table?: unknown[] }).__pdx_table;
});

describe('the signals that a navigation is about to happen', () => {
    it('the pointer arriving fetches the chunk', () => {
        const el = link({ to: '/dest' });
        el.dispatchEvent(new Event('pointerenter'));
        expect(loaded, 'hovering the link fetched nothing').toEqual(['/dest']);
    });

    it('focus fetches it too, which is the keyboard path', () => {
        const el = link({ to: '/dest' });
        el.dispatchEvent(new Event('focusin', { bubbles: true }));
        expect(loaded, 'tabbing to the link fetched nothing').toEqual(['/dest']);
    });

    it('and pointerdown, which is all a touch device gives you', () => {
        // A finger produces no hover and no focus before the tap. `pointerdown` fires before
        // `click`, so the fetch starts while the tap is still happening.
        const el = link({ to: '/dest' });
        el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(loaded).toEqual(['/dest']);
    });

    it('and three of them together still fetch once', () => {
        const el = link({ to: '/dest' });
        el.dispatchEvent(new Event('pointerenter'));
        el.dispatchEvent(new Event('focusin', { bubbles: true }));
        el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(loaded).toEqual(['/dest']);
    });
});

describe('what the route says', () => {
    it("`@prefetch 'eager'` fetches as soon as a link to it is on the page", () => {
        link({ to: '/eagerly' });
        expect(loaded, 'an eager route waited for a hover').toEqual(['/eagerly']);
    });

    it("`@prefetch 'never'` is not fetched, hover or not", () => {
        const el = link({ to: '/admin' });
        el.dispatchEvent(new Event('pointerenter'));
        el.dispatchEvent(new Event('focusin', { bubbles: true }));
        expect(loaded).toEqual([]);
    });

    it('and a link can opt out locally', () => {
        // The route decides the policy; a link may still refuse for its own reason — a "log out"
        // in a menu of fifty, a link the page renders a hundred times.
        const el = link({ to: '/dest', prefetch: 'never' });
        el.dispatchEvent(new Event('pointerenter'));
        expect(loaded).toEqual([]);
    });
});

describe('what must never be fetched', () => {
    it('a destination the sanitiser rejects', () => {
        const el = link({ to: 'javascript:alert(1)' });
        el.dispatchEvent(new Event('pointerenter'));
        expect(loaded).toEqual([]);
    });

    it('and an external URL, which is not this router\'s to load', () => {
        const el = link({ to: 'https://example.com/dest' });
        el.dispatchEvent(new Event('pointerenter'));
        expect(loaded).toEqual([]);
    });
});

describe('and it stops when the link goes', () => {
    it('a removed link does not fetch on a late event', () => {
        const el = link({ to: '/dest' });
        el.remove();
        el.dispatchEvent(new Event('pointerenter'));
        expect(loaded, 'a disconnected link still listened').toEqual([]);
    });
});
