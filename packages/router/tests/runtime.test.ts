// Tests for runtime router (dev mode — interpreted, generic regex matcher).

import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter, navigate, currentPath, currentParams, currentRoute, onBeforeNavigate, onAfterNavigate } from '../src/runtime';

describe('runtime router', () => {
    beforeEach(() => {
        // Reset URL
        if (typeof history !== 'undefined') {
            history.replaceState(null, '', '/');
        }
    });

    it('createRouter registers routes and resolves initial path', () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/about', component: () => document.createElement('div') },
        ]);

        expect(currentPath()).toBe('/');
    });

    it('navigate changes currentPath', () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/users', component: () => document.createElement('div') },
        ]);

        navigate('/users');
        expect(currentPath()).toBe('/users');
    });

    it('extracts params from dynamic segments', () => {
        createRouter([
            { path: '/users/:id', component: () => document.createElement('div') },
        ]);

        navigate('/users/42');
        expect(currentParams()).toEqual({ id: '42' });
    });

    it('extracts interleaved params correctly', () => {
        createRouter([
            { path: '/org/:orgId/team/:teamId', component: () => document.createElement('div') },
        ]);

        navigate('/org/acme/team/dev');
        expect(currentParams()).toEqual({ orgId: 'acme', teamId: 'dev' });
    });

    it('resolves to null for unmatched routes', () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
        ]);

        navigate('/nonexistent');
        expect(currentRoute()).toBeNull();
    });

    it('currentRoute contains config reference', () => {
        const homeConfig = { path: '/', component: () => document.createElement('div') };
        createRouter([homeConfig]);

        navigate('/');
        expect(currentRoute()?.config).toBe(homeConfig);
    });

    it('navigate with params replaces :param in path', () => {
        createRouter([
            { path: '/users/:id', component: () => document.createElement('div') },
        ]);

        navigate('/users/:id', { id: '99' });
        expect(currentPath()).toBe('/users/99');
        expect(currentParams()).toEqual({ id: '99' });
    });

    it('navigate URL-encodes param values (so /, ?, #, space cannot change the path)', async () => {
        createRouter([
            { path: '/users/:id', component: () => document.createElement('div') },
        ]);

        navigate('/users/:id', { id: 'a/b?c#d e' });
        expect(currentPath()).toBe('/users/' + encodeURIComponent('a/b?c#d e'));
        // round-trips: the matched param is decoded back to the original value
        await Promise.resolve();
        expect(currentParams()).toEqual({ id: 'a/b?c#d e' });
    });
});

describe('navigation middleware', () => {
    beforeEach(() => {
        if (typeof history !== 'undefined') history.replaceState(null, '', '/');
    });

    it('onBeforeNavigate is called before navigation', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/about', component: () => document.createElement('div') },
        ]);

        const visited: string[] = [];
        const dispose = onBeforeNavigate((from, to) => {
            visited.push(`${from}->${to}`);
            return true;
        });

        navigate('/about');
        // handleNavigation is now async, give it a tick
        await new Promise(r => setTimeout(r, 10));
        expect(visited).toContain('/->/about');
        dispose();
    });

    it('onBeforeNavigate can cancel navigation', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/blocked', component: () => document.createElement('div') },
        ]);

        navigate('/');
        await new Promise(r => setTimeout(r, 10));

        const dispose = onBeforeNavigate((_from, to) => {
            return to !== '/blocked';
        });

        navigate('/blocked');
        await new Promise(r => setTimeout(r, 10));
        // Navigation should have been cancelled — path stays at /
        expect(currentRoute()?.config.path ?? '/').toBe('/');
        dispose();
    });

    it('onAfterNavigate is called after navigation', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/done', component: () => document.createElement('div') },
        ]);

        const visited: string[] = [];
        const dispose = onAfterNavigate((from, to) => {
            visited.push(`after:${from}->${to}`);
        });

        navigate('/done');
        await new Promise(r => setTimeout(r, 10));
        expect(visited.some(v => v.includes('/done'))).toBe(true);
        dispose();
    });

    it('dispose removes the hook', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/test', component: () => document.createElement('div') },
        ]);

        let count = 0;
        const dispose = onBeforeNavigate(() => { count++; return true; });

        navigate('/test');
        await new Promise(r => setTimeout(r, 10));
        const countAfterFirst = count;

        dispose();
        navigate('/');
        await new Promise(r => setTimeout(r, 10));
        // count should not have increased after dispose
        expect(count).toBe(countAfterFirst);
    });
});
