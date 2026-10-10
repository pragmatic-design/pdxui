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
            if (!['/dest', '/eagerly', '/admin', '/below'].includes(path)) return undefined;
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
    { path: '/below', tag: 'pdx-below', prefetch: 'viewport' },
];

/**
 * An IntersectionObserver the test drives: happy-dom lays nothing out, so «in view» is said here.
 * Every instance is recorded, with the elements it watches.
 */
const observers: { cb: IntersectionObserverCallback; watched: Set<Element>; self: unknown }[] = [];
class FakeIntersectionObserver {
    private readonly entry: { cb: IntersectionObserverCallback; watched: Set<Element>; self: unknown };
    constructor(cb: IntersectionObserverCallback) {
        this.entry = { cb, watched: new Set(), self: this };
        observers.push(this.entry);
    }
    observe(el: Element) { this.entry.watched.add(el); }
    unobserve(el: Element) { this.entry.watched.delete(el); }
    disconnect() { this.entry.watched.clear(); }
}
(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver;

/**
 * Tell the observers that the link's ANCHOR entered (or left) the viewport.
 *
 * The anchor, not the `<pdx-link>`: the host is `display: contents`, has no box, and a real
 * IntersectionObserver never reports it as intersecting — measured in Chromium (#42).
 */
function scrollInto(el: Element, isIntersecting = true): void {
    const target = el.querySelector('a')!;
    for (const o of observers) {
        if (!o.watched.has(target)) continue;
        o.cb([{ target, isIntersecting } as unknown as IntersectionObserverEntry], o.self as IntersectionObserver);
    }
}

/** How many elements are being watched across every observer. */
const watchedCount = (): number => observers.reduce((n, o) => n + o.watched.size, 0);

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
    for (const o of observers) o.watched.clear();
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

    it("`@prefetch 'viewport'` fetches when the link scrolls into view, and not before", () => {
        const el = link({ to: '/below' });
        expect(loaded, 'a viewport route was fetched before its link was seen').toEqual([]);
        scrollInto(el);
        expect(loaded, 'the link came into view and nothing was fetched').toEqual(['/below']);
    });

    it("`@prefetch 'viewport'` watches the anchor, which has a box, not the `display: contents` host", () => {
        const el = link({ to: '/below' });
        const watched = observers.flatMap((o) => [...o.watched]);
        expect(watched, 'the host was watched: an element with no box never intersects').toEqual([el.querySelector('a')]);
    });

    it("`@prefetch 'viewport'` is fetched once, and the link is no longer watched", () => {
        const el = link({ to: '/below' });
        scrollInto(el);
        scrollInto(el, false);
        scrollInto(el);
        expect(loaded).toEqual(['/below']);
        expect(watchedCount(), 'the link is still observed after its fetch').toBe(0);
    });

    it("`@prefetch 'viewport'` still fetches on hover, before it was seen", () => {
        const el = link({ to: '/below' });
        el.dispatchEvent(new Event('pointerenter'));
        expect(loaded).toEqual(['/below']);
    });

    it("a link whose `to` is bound — written after it connects — is watched too", () => {
        // `:to="'/assets/' + id"` sets the property once the element is in the page: the policy read
        // at connect time saw no `to` and was `hover`, so a bound viewport link was never watched.
        const el = link({});
        (el as unknown as { to: string }).to = '/below';
        expect(watchedCount(), 'the bound link was not watched').toBe(1);
        scrollInto(el);
        expect(loaded).toEqual(['/below']);
    });

    it("and an `eager` route behind a bound `to` is fetched once `to` arrives", () => {
        const el = link({});
        expect(loaded).toEqual([]);
        (el as unknown as { to: string }).to = '/eagerly';
        expect(loaded, 'an eager route behind a bound link waited for a hover').toEqual(['/eagerly']);
    });

    it('control — a hover route is not watched at all', () => {
        link({ to: '/dest' });
        expect(watchedCount(), 'a hover route was observed for the viewport').toBe(0);
    });

    it('one observer serves every viewport link, not one each', () => {
        link({ to: '/below' });
        link({ to: '/below' });
        link({ to: '/below' });
        expect(observers.filter((o) => o.watched.size > 0).length).toBe(1);
    });

    it('a removed viewport link is no longer watched', () => {
        const el = link({ to: '/below' });
        el.remove();
        expect(watchedCount()).toBe(0);
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
