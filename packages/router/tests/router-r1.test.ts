// Router R1 — correctness + lifecycle. Red→green.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter, navigate, currentPath, currentRoute, destroyRouter, registerGuardChecker } from '../src/runtime';

describe('router R1 — correctness', () => {
    beforeEach(() => {
        if (typeof history !== 'undefined') history.replaceState(null, '', '/');
        destroyRouter();
    });

    it('matches uppercase UUIDs (RFC 4122 is case-insensitive)', () => {
        createRouter([{ path: '/u/:id(uuid)', component: () => document.createElement('div') }]);
        const upper = '550E8400-E29B-41D4-A716-446655440000';
        navigate('/u/' + upper);
        expect(currentRoute()).not.toBeNull();
        expect(currentRoute()!.params.id).toBe(upper);
    });

    it('still matches lowercase UUIDs', () => {
        createRouter([{ path: '/u/:id(uuid)', component: () => document.createElement('div') }]);
        const lower = '550e8400-e29b-41d4-a716-446655440000';
        navigate('/u/' + lower);
        expect(currentRoute()!.params.id).toBe(lower);
    });

    it('honors guardFailRedirect when a guard fails (was previously ignored)', async () => {
        registerGuardChecker((name) => name !== 'admin');
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/login', component: () => document.createElement('div') },
            { path: '/admin', component: () => document.createElement('div'), guard: 'admin' },
        ], { guardFailRedirect: '/login' });
        navigate('/admin');
        await new Promise(r => setTimeout(r, 20));
        expect(currentPath()).toBe('/login');
        expect(currentRoute()?.config.path).toBe('/login');
    });
});

describe('router R1 — listener lifecycle (no leak)', () => {
    beforeEach(() => {
        if (typeof history !== 'undefined') history.replaceState(null, '', '/');
        destroyRouter();
    });

    it('destroyRouter removes the popstate listener', () => {
        createRouter([
            { path: '/a', component: () => document.createElement('div') },
            { path: '/b', component: () => document.createElement('div') },
        ]);
        navigate('/a');
        expect(currentPath()).toBe('/a');

        destroyRouter();

        // Simulate browser back: change URL then fire popstate. With the listener
        // removed, the router must NOT react.
        history.replaceState(null, '', '/b');
        window.dispatchEvent(new Event('popstate'));
        expect(currentPath()).toBe('/a');
    });

    it('re-initializing the router does not stack popstate listeners', () => {
        // Each createRouter must remove the previous listener (HMR-safe).
        createRouter([{ path: '/a', component: () => document.createElement('div') }]);
        createRouter([
            { path: '/a', component: () => document.createElement('div') },
            { path: '/b', component: () => document.createElement('div') },
        ]);
        navigate('/a');
        // One popstate → exactly one navigation to /b (not multiplied by stale listeners).
        history.replaceState(null, '', '/b');
        window.dispatchEvent(new Event('popstate'));
        expect(currentPath()).toBe('/b');
        destroyRouter();
    });
});
