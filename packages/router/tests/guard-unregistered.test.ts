// A guard that cannot be evaluated is not the same as no guard.
//
// `runtime.ts:362` read `if (config.guard && guardChecker)`, so a route with a declared `@guard`
// opened when nothing had called `registerGuardChecker`. `<pdx-router-outlet>` calls it inside
// autoInitRouter, so an app that mounts the outlet was covered — but `createRouter` is the FIRST
// public export of the package and is not marked internal, and an app that calls it directly got
// every `@guard` skipped in silence.
//
// permissions.md said "The router checks it before activating the route — no manual wiring", which
// was false on that path. The same page is honest about the model that matters — permissions are a
// UI affordance, not security, and the server is the authority — so this is a correctness and
// documentation defect, not a vulnerability, and it is fixed as that.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    createRouter, destroyRouter, navigate,
    currentRoute, currentNavError, registerGuardChecker,
} from '../src/runtime';

const settle = () => new Promise(r => setTimeout(r, 20));

const routes = () => [
    { path: '/', component: () => document.createElement('div') },
    { path: '/admin', component: () => document.createElement('div'), guard: 'admin' },
];

beforeEach(() => {
    destroyRouter();
    history.replaceState(null, '', '/');
});

describe('a declared guard with no checker registered', () => {
    it('denies the route instead of opening it', async () => {
        // Deliberately no registerGuardChecker: this is the state an app that calls createRouter()
        // without mounting the outlet is in.
        createRouter(routes());
        navigate('/');
        await settle();

        navigate('/admin');
        await settle();

        expect(currentRoute(), 'a guarded route activated with nothing able to evaluate its guard').toBeNull();
        expect(currentNavError()).toBe('403');
    });

    it('still allows an unguarded route', async () => {
        // The fix must deny the guarded one, not everything.
        createRouter(routes());
        navigate('/');
        await settle();
        expect(currentRoute()?.config.path).toBe('/');
    });

    it('allows a guarded route once a checker permits it', async () => {
        registerGuardChecker(() => true);
        createRouter(routes());
        navigate('/admin');
        await settle();
        expect(currentRoute()?.config.path).toBe('/admin');
        expect(currentNavError()).toBeNull();
    });
});
