// A denial has two causes, and the app is the only one that can tell them apart.
//
// A `guardFailRedirect` string sends every denial to the same place. For an unauthenticated visitor
// that is right: the login, with the refused path remembered. For an authenticated one it is a page
// that asks for the one thing they already have — signed in as `admin`, clicking a tab whose
// permission no role holds: `→ /login`.
//
// The router cannot tell the two apart. It asks a `guardChecker` that answers a boolean, and what
// makes the difference — whether there is a session at all — is the application's own notion. So
// the option takes a FUNCTION of the denied permission as well as a string, and an app answers
// `null` for "not a redirect: show the refusal where it happened".
//
// Chosen over two other shapes: a second `isAuthenticated` callback leaves the
// policy in the router, where it cannot be right for everyone, and widening the checker's answer to
// `'deny' | 'unauthenticated'` changes a contract every existing checker implements. A function is
// the smallest thing that puts the decision where the knowledge is, and a string still works.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRouter, navigate, currentRoute, currentNavError, registerGuardChecker } from '../src/runtime';

const ROUTES = [
    { path: '/', component: () => document.createElement('div') },
    { path: '/login', component: () => document.createElement('div') },
    { path: '/billing', component: () => document.createElement('div'), guard: 'tickets.billing' },
];

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('guardFailRedirect as a function of the denied permission', () => {
    beforeEach(() => {
        history.replaceState(null, '', '/');
        registerGuardChecker(() => false);
    });

    it('redirects when the app answers a path', async () => {
        createRouter(ROUTES, { guardFailRedirect: () => '/login' });
        navigate('/billing');
        await settle();

        expect(currentRoute()?.config.path, 'the app asked for the login and did not get it').toBe('/login');
        expect(currentNavError()).toBeNull();
        expect(location.pathname, 'the address bar stayed on the refused route').toBe('/login');
    });

    it('shows the refusal where it happened when the app answers null', async () => {
        // The case this issue is about: a session that is valid and a permission that is missing.
        createRouter(ROUTES, { guardFailRedirect: () => null });
        navigate('/billing');
        await settle();

        expect(currentNavError(), 'the visitor was sent somewhere instead of being refused').toBe('403');
        expect(location.pathname, 'a 403 that moves the address bar cannot be reloaded or linked')
            .toBe('/billing');
    });

    it('is asked WHICH permission was denied, so an app can answer per route', async () => {
        const asked: string[] = [];
        createRouter(ROUTES, {
            guardFailRedirect: (permission) => { asked.push(permission); return null; },
        });
        navigate('/billing');
        await settle();

        expect(asked, 'the callback was handed nothing to decide with').toEqual(['tickets.billing']);
    });

    it('control — a string still redirects, which is every app written before this', async () => {
        createRouter(ROUTES, { guardFailRedirect: '/login' });
        navigate('/billing');
        await settle();

        expect(currentRoute()?.config.path).toBe('/login');
    });

    it('control — no option at all is still the 403', async () => {
        createRouter(ROUTES, {});
        navigate('/billing');
        await settle();

        expect(currentNavError()).toBe('403');
    });

    it('refuses a target outside the origin, whether it came from a string or a function', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createRouter(ROUTES, { guardFailRedirect: () => 'https://evil.example/login' });
        navigate('/billing');
        await settle();

        // The refusal returns without navigating, which leaves the address bar where `navigate()`
        // had already written it — the route is what says it did not happen.
        expect(currentRoute()?.config.path, 'a function got to name an off-origin target a string could not')
            .toBe('/');
        expect(location.origin, 'the router left the origin').toBe(new URL(location.href).origin);
        expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('must be a path inside this origin');
        warn.mockRestore();
    });
});
