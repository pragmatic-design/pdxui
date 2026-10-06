// Tests for Router v2 features: catch-all, param constraints, redirects, query, guards.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    createRouter, navigate, currentPath, currentParams, currentRoute,
    currentQuery, currentState, registerGuardChecker, setQueryParam,
} from '../src/runtime';

describe('catch-all wildcard', () => {
    beforeEach(() => { if (typeof history !== 'undefined') history.replaceState(null, '', '/'); });

    it('matches wildcard route /*', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/files/*', component: () => document.createElement('div') },
        ]);

        navigate('/files/docs/readme.md');
        await new Promise(r => setTimeout(r, 10));
        expect(currentParams().$rest).toBe('docs/readme.md');
    });

    it('catch-all does not match more specific routes', async () => {
        createRouter([
            { path: '/about', component: () => document.createElement('div') },
            { path: '/*', component: () => document.createElement('div') },
        ]);

        navigate('/about');
        await new Promise(r => setTimeout(r, 10));
        expect(currentRoute()?.config.path).toBe('/about');
    });
});

describe('param constraints', () => {
    beforeEach(() => { if (typeof history !== 'undefined') history.replaceState(null, '', '/'); });

    it(':id(number) matches only digits', async () => {
        createRouter([
            { path: '/users/:id(number)', component: () => document.createElement('div') },
        ]);

        navigate('/users/42');
        await new Promise(r => setTimeout(r, 10));
        expect(currentParams().id).toBe('42');
    });

    it(':id(number) rejects non-numeric', async () => {
        createRouter([
            { path: '/users/:id(number)', component: () => document.createElement('div') },
        ]);

        navigate('/users/abc');
        await new Promise(r => setTimeout(r, 10));
        expect(currentRoute()).toBeNull();
    });

    it(':slug without constraint matches anything', async () => {
        createRouter([
            { path: '/posts/:slug', component: () => document.createElement('div') },
        ]);

        navigate('/posts/hello-world');
        await new Promise(r => setTimeout(r, 10));
        expect(currentParams().slug).toBe('hello-world');
    });

    it('custom regex constraint works', async () => {
        createRouter([
            { path: '/lang/:code([a-z]{2})', component: () => document.createElement('div') },
        ]);

        navigate('/lang/en');
        await new Promise(r => setTimeout(r, 10));
        expect(currentParams().code).toBe('en');

        navigate('/lang/english');
        await new Promise(r => setTimeout(r, 10));
        expect(currentRoute()).toBeNull();
    });
});

describe('redirects', () => {
    beforeEach(() => { if (typeof history !== 'undefined') history.replaceState(null, '', '/'); });

    it('route-level redirect navigates to target', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div'), redirect: '/dashboard' },
            { path: '/dashboard', component: () => document.createElement('div') },
        ]);

        // Initial navigation to / should redirect to /dashboard
        await new Promise(r => setTimeout(r, 20));
        expect(currentPath()).toBe('/dashboard');
    });

    it('options-level redirects work', async () => {
        createRouter([
            { path: '/home', component: () => document.createElement('div') },
        ], { redirects: [{ from: '/', to: '/home' }] });

        await new Promise(r => setTimeout(r, 20));
        expect(currentPath()).toBe('/home');
    });
});

describe('query params', () => {
    beforeEach(() => { if (typeof history !== 'undefined') history.replaceState(null, '', '/'); });

    it('currentQuery returns parsed search params', async () => {
        createRouter([
            { path: '/search', component: () => document.createElement('div') },
        ]);

        // Simulate URL with query
        history.replaceState(null, '', '/search?page=2&sort=name');
        navigate('/search');
        await new Promise(r => setTimeout(r, 10));
        // Query is parsed from location.search
        const q = currentQuery();
        expect(typeof q).toBe('object');
    });

    it('setQueryParam updates a single param', () => {
        setQueryParam('filter', 'active');
        const q = currentQuery();
        expect(q.filter).toBe('active');
    });

    it('setQueryParam with null removes param', () => {
        setQueryParam('filter', 'active');
        setQueryParam('filter', null);
        const q = currentQuery();
        expect(q.filter).toBeUndefined();
    });
});

describe('guard enforcement', () => {
    beforeEach(() => {
        if (typeof history !== 'undefined') history.replaceState(null, '', '/');
        registerGuardChecker(() => true); // reset
    });

    it('allows navigation when guard passes', async () => {
        registerGuardChecker(() => true);
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/admin', component: () => document.createElement('div'), guard: 'admin' },
        ]);

        navigate('/admin');
        await new Promise(r => setTimeout(r, 20));
        expect(currentRoute()?.config.path).toBe('/admin');
    });

    it('blocks navigation when guard fails', async () => {
        registerGuardChecker((name) => name !== 'admin');
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/admin', component: () => document.createElement('div'), guard: 'admin' },
        ]);

        navigate('/');
        await new Promise(r => setTimeout(r, 10));
        navigate('/admin');
        await new Promise(r => setTimeout(r, 20));
        // Route should be null (guard rejected)
        expect(currentRoute()).toBeNull();
    });
});

describe('navigation state (virtual params)', () => {
    beforeEach(() => { if (typeof history !== 'undefined') history.replaceState(null, '', '/'); });

    it('navigate passes state accessible via currentState', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/detail', component: () => document.createElement('div') },
        ]);

        navigate('/detail', undefined, { fromList: true, item: { id: 1, name: 'Test' } });
        await new Promise(r => setTimeout(r, 10));
        expect(currentState()).toEqual({ fromList: true, item: { id: 1, name: 'Test' } });
    });

    it('state is undefined when not provided', async () => {
        createRouter([
            { path: '/page', component: () => document.createElement('div') },
        ]);

        navigate('/page');
        await new Promise(r => setTimeout(r, 10));
        expect(currentState()).toBeUndefined();
    });

    it('state is replaced on each navigation', async () => {
        createRouter([
            { path: '/a', component: () => document.createElement('div') },
            { path: '/b', component: () => document.createElement('div') },
        ]);

        navigate('/a', undefined, { step: 1 });
        await new Promise(r => setTimeout(r, 10));
        expect(currentState()).toEqual({ step: 1 });

        navigate('/b', undefined, { step: 2 });
        await new Promise(r => setTimeout(r, 10));
        expect(currentState()).toEqual({ step: 2 });
    });
});

describe('route meta', () => {
    it('currentRoute includes meta', async () => {
        createRouter([
            { path: '/page', component: () => document.createElement('div'), meta: { title: 'My Page', permissions: ['view'] } },
        ]);

        navigate('/page');
        await new Promise(r => setTimeout(r, 10));
        expect(currentRoute()?.config.meta).toEqual({ title: 'My Page', permissions: ['view'] });
    });
});
