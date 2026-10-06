// Error pages.
//
// The outlet renders one of two things when a route does not resolve: a registered error-page
// component for that code, or an inline fallback. Both are reachable from a running app (a 404
// from a bad URL, a 403 from a denied guard), and the fallback interpolates the live URL — which
// is attacker-controlled, and is why it goes in through textContent.

import { describe, it, expect, beforeAll } from 'vitest';
import { setPermissions } from '@pdxui/core';

let errorPageRenders = 0;
class Error404 extends HTMLElement {
    connectedCallback() { errorPageRenders++; }
}
customElements.define('pdx-error-404', Error404);

for (const tag of ['pdx-ep-home', 'pdx-ep-secret']) {
    customElements.define(tag, class extends HTMLElement {});
}

(globalThis as Record<string, unknown>).__pdx_error_pages = { '404': 'pdx-error-404' };
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-ep-home' },
    { path: '/secret', tag: 'pdx-ep-secret', guard: 'admin' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
let outlet: HTMLElement;

beforeAll(async () => {
    setPermissions([]);                      // no permissions → the guard denies
    history.replaceState(null, '', '/');
    outlet = document.createElement('pdx-router-outlet');
    document.body.appendChild(outlet);
    await tick();
});

describe('a registered error page', () => {
    it('is used for the code it was registered under', async () => {
        navigate('/no-such-page');
        await tick();

        const page = outlet.querySelector('pdx-error-404');
        expect(page, 'the registered 404 component was not used').not.toBeNull();
        expect(page!.getAttribute('code')).toBe('404');
        expect(page!.getAttribute('path'), 'the error page was not told which URL failed')
            .toBe('/no-such-page');
    });

    it('replaces itself rather than stacking on a second failure', async () => {
        navigate('/also-missing');
        await tick();

        expect(outlet.querySelectorAll('pdx-error-404'),
            'a second error left the first one orphaned in the DOM').toHaveLength(1);
        expect(outlet.querySelector('pdx-error-404')!.getAttribute('path')).toBe('/also-missing');
    });

    it('goes away when a real route takes over', async () => {
        navigate('/');
        await tick();

        expect(outlet.querySelector('pdx-error-404'), 'the error page outlived the error')
            .toBeNull();
        expect(outlet.querySelector('pdx-ep-home')).not.toBeNull();
    });

    it('is rendered again on the next failure', async () => {
        const before = errorPageRenders;
        navigate('/gone');
        await tick();
        expect(errorPageRenders).toBeGreaterThan(before);
    });
});

describe('the inline fallback', () => {
    it('is used for a code with no registered component — here 403 from a denied guard', async () => {
        navigate('/secret');
        await tick();

        const alert = outlet.querySelector('[role="alert"]')!;
        expect(alert, 'a denied guard rendered nothing at all').not.toBeNull();
        expect(alert.getAttribute('aria-label'), 'the fallback did not name the error').toBe('Error 403');
        expect(alert.textContent).toContain('403');
        expect(outlet.querySelector('pdx-ep-secret'), 'the guarded page rendered anyway').toBeNull();
    });

    it('puts the failing URL in as text, never as markup', async () => {
        // The path comes from the address bar. Interpolating it into innerHTML would make a
        // crafted URL executable in the error page of every app using the fallback.
        // Unregister the 404 component first: with one registered, a 404 never reaches here.
        delete (globalThis as Record<string, unknown>).__pdx_error_pages;
        history.replaceState(null, '', '/x/%3Cimg%20src=x%20onerror=alert(1)%3E');
        navigate('/x/<img src=x onerror=alert(1)>');
        await tick();

        const alert = outlet.querySelector('[role="alert"]')!;
        expect(alert.querySelector('img'), 'the URL was parsed as markup').toBeNull();
        // What lands in the page is `location.pathname`, i.e. the percent-encoded form the
        // address bar holds — asserted so the test cannot pass on an empty <code>.
        expect(alert.querySelector('code')!.textContent).toContain('%3Cimg');
    });

    it('says "Page not found" for a 404 and gives a way home', async () => {
        // Same fallback, different code — the 404 component is unregistered from here on.
        navigate('/vanished');
        await tick();

        const alert = outlet.querySelector('[role="alert"]')!;
        expect(alert.getAttribute('aria-label')).toBe('Page not found');
        expect(alert.querySelector('a')!.getAttribute('href'),
            'the error page offered no way out').toBe('/');
    });
});

describe('focus after an error', () => {
    it('the error page is focusable, so the keyboard is not stranded on the old page', async () => {
        navigate('/still-missing');
        await tick();

        const alert = outlet.querySelector('[role="alert"]')!;
        expect(alert.getAttribute('tabindex'), 'the error page could not receive focus').toBe('-1');
    });
});
