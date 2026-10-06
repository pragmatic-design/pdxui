// A denied guard that redirects: what renders, and what the address bar says.
//
// Two failures this guards against, both in a production build:
//
//   · deep-linking to a guarded route with no session renders NOTHING — no login, no error page,
//     an empty outlet, no console message — while the redirect happens inside the router (the
//     login page's module is even fetched) and the outlet never shows it;
//   · clicking through to one renders the login and leaves the address bar saying `/account`. A
//     reload then goes back to the guarded route, and a bookmark saves the page the visitor was
//     refused.
//
// `parity.test.ts` asserts `currentRoute()?.path` after a denial, which stays green through both:
// the route is right, and it asks neither what is on screen nor what is in the URL.
import { describe, it, expect, beforeAll } from 'vitest';
import { setPermissions } from '@pdxui/core';

for (const tag of ['pdx-gr-home', 'pdx-gr-admin', 'pdx-gr-login']) {
    customElements.define(tag, class extends HTMLElement {});
}

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-gr-home' },
    { path: '/admin', tag: 'pdx-gr-admin', guard: 'admin.read' },
    { path: '/login', tag: 'pdx-gr-login' },
];
(globalThis as Record<string, unknown>).__pdx_guard_redirect = '/login';

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));

let outlet: HTMLElement;

beforeAll(async () => {
    // Nothing is granted, so the guard denies — the state an unauthenticated visitor is in.
    setPermissions([]);
    // The deep link: the address is the guarded route before the outlet exists, which is what a
    // cold load of a bookmarked URL looks like. The outlet boots the router itself.
    history.replaceState(null, '', '/admin');
    outlet = document.createElement('pdx-router-outlet');
    document.body.appendChild(outlet);
    await tick();
    await tick();
});

describe('a deep link to a guarded route, denied', () => {
    it('renders the redirect target', () => {
        expect(outlet.querySelector('pdx-gr-login'),
            'the guard denied the route, the router redirected, and the outlet showed nothing')
            .not.toBeNull();
    });

    it('does not render the page it refused', () => {
        // The half that would be a leak rather than a blank screen.
        expect(outlet.querySelector('pdx-gr-admin')).toBeNull();
    });

    it('and the address bar says where the visitor actually is', () => {
        // A reload has to land on the login too, and a bookmark must not save the refusal.
        expect(location.pathname).toBe('/login');
    });
});

describe('a navigation to a guarded route, denied', () => {
    beforeAll(async () => {
        navigate('/');
        await tick();
        navigate('/admin');
        await tick();
        await tick();
    });

    it('renders the redirect target', () => {
        expect(outlet.querySelector('pdx-gr-login')).not.toBeNull();
    });

    it('and the address bar follows it', () => {
        expect(location.pathname).toBe('/login');
    });
});

describe('and the guard still lets an allowed visitor through', () => {
    // The control. Redirecting always would satisfy everything above, and a router that never
    // opens a guarded route is not a router with working guards.
    beforeAll(async () => {
        setPermissions(['admin.read']);
        navigate('/admin');
        await tick();
        await tick();
    });

    it('renders the guarded page', () => {
        expect(outlet.querySelector('pdx-gr-admin'),
            'a granted permission must open the route').not.toBeNull();
    });

    it('and the address bar is the guarded route', () => {
        expect(location.pathname).toBe('/admin');
    });
});
