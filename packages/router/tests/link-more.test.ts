// <pdx-link> — the click path, prefetch, and teardown.
//
// link.test.ts covers the active-class boundary and href sanitising. This covers the part a
// user actually performs: the click, and the modifiers that must NOT be intercepted — a
// ctrl-click that navigates in-page instead of opening a tab is a broken link, not a feature.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter, navigate, currentPath } from '../src/runtime';
import '../src/link';

const page = () => document.createElement('div');

function link(attrs: Record<string, string>, text = 'go'): HTMLElement {
    const el = document.createElement('pdx-link');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.textContent = text;
    document.body.appendChild(el);
    return el;
}

beforeEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('link[rel="prefetch"]').forEach((l) => l.remove());
    history.replaceState(null, '', '/');
    createRouter([
        { path: '/', component: page },
        { path: '/dest', component: page },
        { path: '/users/:id', component: page },
    ]);
    navigate('/');
});

describe('the click', () => {
    it('navigates in-page and does not let the browser follow the href', () => {
        const el = link({ to: '/dest' });
        const anchor = el.querySelector('a')!;
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });

        anchor.dispatchEvent(ev);

        expect(currentPath()).toBe('/dest');
        expect(ev.defaultPrevented, 'the browser was left to do a full page load').toBe(true);
    });

    it('fills the params it is given', () => {
        link({ to: '/users/:id', params: '{"id":"42"}' }).querySelector('a')!.click();
        expect(currentPath()).toBe('/users/42');
    });

    it('a link with no destination does nothing', () => {
        const el = link({});
        const before = currentPath();
        expect(() => el.querySelector('a')!.click()).not.toThrow();
        expect(currentPath()).toBe(before);
    });

    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
        it(`leaves a ${modifier} click to the browser`, () => {
            const el = link({ to: '/dest' });
            const before = currentPath();
            const ev = new MouseEvent('click', { bubbles: true, cancelable: true, [modifier]: true });

            el.querySelector('a')!.dispatchEvent(ev);

            expect(currentPath(), `a ${modifier} click navigated in-page`).toBe(before);
            expect(ev.defaultPrevented, 'open-in-new-tab was cancelled').toBe(false);
        });
    }
});

describe('the anchor it renders', () => {
    it('wraps the text it was given, keeping it clickable and copyable', () => {
        const el = link({ to: '/dest' }, 'Go to dest');
        const anchor = el.querySelector('a')!;
        expect(anchor.textContent).toBe('Go to dest');
        expect(anchor.getAttribute('href')).toBe('/dest');
    });

    it('leaves an anchor the author wrote alone', () => {
        const el = document.createElement('pdx-link');
        el.setAttribute('to', '/dest');
        el.innerHTML = '<a href="/dest" class="mine">go</a>';
        document.body.appendChild(el);

        expect(el.querySelectorAll('a'), 'the component wrapped an anchor in another anchor')
            .toHaveLength(1);
        expect(el.querySelector('a')!.className).toBe('mine');
    });

    it('still navigates through an author-written anchor', () => {
        const el = document.createElement('pdx-link');
        el.setAttribute('to', '/dest');
        el.innerHTML = '<a href="/dest">go</a>';
        document.body.appendChild(el);

        el.querySelector('a')!.click();

        expect(currentPath()).toBe('/dest');
    });
});

// A `<link rel="prefetch" href="/dest">` in the head prefetches nothing: in a single-page app it asks
// the server for the SPA fallback — `index.html` — and never for the route's JavaScript. The link
// prefetches with the route's own `import()`, and that loader is asserted in
// `link-prefetch.test.ts`, where the route table can be faked. What is here is the half that is
// about THIS element rather than about the router: it must not hand the browser a URL the
// sanitiser rejected, and the head must stay clean.
describe('prefetch', () => {
    it('adds no document hint — the fetch is the route\'s module, not its URL', () => {
        const el = link({ to: '/dest' });
        el.dispatchEvent(new PointerEvent('pointerenter'));
        expect(document.head.querySelectorAll('link[rel="prefetch"]'),
            'the link is prefetching the SPA fallback again').toHaveLength(0);
    });

    it('never prefetches a destination the sanitiser rejects', () => {
        const el = link({ to: 'javascript:alert(1)' });
        el.dispatchEvent(new PointerEvent('pointerenter'));
        expect(document.head.querySelectorAll('link[rel="prefetch"]'),
            'a rejected URL was still handed to the browser to fetch').toHaveLength(0);
    });
});

describe('teardown', () => {
    it('stops navigating once removed from the page', () => {
        const el = link({ to: '/dest' });
        const anchor = el.querySelector('a')!;
        el.remove();

        anchor.click();

        expect(currentPath(), 'a detached link still drove the router').toBe('/');
    });

    it('stops tracking the active class once removed', async () => {
        const el = link({ to: '/dest', 'active-class': 'on' });
        expect(el.classList.contains('on')).toBe(false);
        el.remove();

        navigate('/dest');
        await new Promise((r) => setTimeout(r, 0));

        expect(el.classList.contains('on'), 'a detached link kept following the route')
            .toBe(false);
    });

    it('a link with no active-class creates no effect to leak', () => {
        const el = link({ to: '/dest' });
        expect(() => { el.remove(); }).not.toThrow();
    });
});

// `:to` is a PROPERTY binding, and the element reads the attribute.
//
// `<pdx-link :to="'/tickets/' + id">` is how every link to a detail is written: a list of rows, a
// set of tabs, anything whose target is computed. The compiler sets the property; this element
// builds its `<a href>` from `getAttribute('to')` at connect and reads the attribute again on
// click. Without the property reflecting, the anchor would stay at `href="#"`, the click handler
// would find no `to` and return, and the link would do nothing at all.
//
// Static `to="/dest"` works either way, which is why an app shell full of fixed links never
// shows it.
describe('the `to` property, not just the attribute', () => {
    it('sets the anchor href when `to` is assigned as a property', () => {
        const el = document.createElement('pdx-link');
        el.textContent = 'go';
        document.body.appendChild(el);

        (el as HTMLElement & { to?: string }).to = '/users/7';

        expect(el.querySelector('a')?.getAttribute('href'),
            'the anchor kept the placeholder href').toBe('/users/7');
    });

    it('navigates on click when `to` came from a property', () => {
        const el = document.createElement('pdx-link');
        el.textContent = 'go';
        document.body.appendChild(el);
        (el as HTMLElement & { to?: string }).to = '/dest';

        el.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(currentPath(), 'the click did nothing — the handler reads the attribute').toBe('/dest');
    });

    it('reads back what was assigned, and reflects a later change', () => {
        const el = document.createElement('pdx-link');
        document.body.appendChild(el);
        (el as HTMLElement & { to?: string }).to = '/users/1';
        expect((el as HTMLElement & { to?: string }).to).toBe('/users/1');

        (el as HTMLElement & { to?: string }).to = '/users/2';
        expect(el.querySelector('a')?.getAttribute('href')).toBe('/users/2');
    });

    it('control — the attribute still works on its own', () => {
        const el = link({ to: '/dest' });
        expect(el.querySelector('a')?.getAttribute('href')).toBe('/dest');
    });
});

// The case the three tests above do NOT cover, and the one that actually bit: a property written
// while the tag is still unknown. It becomes an own property on the instance and shadows the
// accessor, so the setter never runs — which is why the fix is only half a fix without the
// upgrade in `connectedCallback`.
describe('a `to` set before the element upgraded', () => {
    it('is picked up when the element connects', () => {
        const el = document.createElement('pdx-link');
        // Exactly what assigning to an un-upgraded element leaves behind.
        Object.defineProperty(el, 'to', { value: '/users/9', writable: true, configurable: true, enumerable: true });
        el.textContent = 'go';

        document.body.appendChild(el);

        expect(el.getAttribute('to'), 'the pre-upgrade value never reached the attribute').toBe('/users/9');
        expect(el.querySelector('a')?.getAttribute('href')).toBe('/users/9');
    });
});
