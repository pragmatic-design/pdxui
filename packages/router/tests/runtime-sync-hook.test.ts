// A before-hook that answers a boolean does not defer the navigation.
//
// Awaiting a boolean still yields a microtask: awaiting every hook would make every navigation
// asynchronous as soon as any hook is registered. The outlet registers one — the page's leave check —
// so a page with no guard at all would resolve a microtask later, and a page resolved a second time
// after it has mounted loses what it rendered.
import { describe, it, expect, afterEach } from 'vitest';
import { createRouter, destroyRouter, navigate, currentPath, onBeforeNavigate } from '../src/runtime';

const ROUTES = [
    { path: '/a', component: () => document.createElement('div') },
    { path: '/b', component: () => document.createElement('div') },
];

const offs: (() => void)[] = [];
afterEach(() => { for (const off of offs.splice(0)) off(); destroyRouter(); });

describe('runtime router — a hook that answers synchronously', () => {
    it('true: the navigation resolves within the call', () => {
        history.replaceState(null, '', '/a');
        createRouter(ROUTES);
        offs.push(onBeforeNavigate(() => true));
        navigate('/b');
        expect(currentPath(), 'a boolean answer was awaited').toBe('/b');
    });

    it('false: refused within the call', () => {
        history.replaceState(null, '', '/a');
        createRouter(ROUTES);
        offs.push(onBeforeNavigate(() => false));
        navigate('/b');
        expect(currentPath()).toBe('/a');
        expect(location.pathname).toBe('/a');
    });

    it('the control: a hook that returns a promise is awaited — nothing resolves within the call', async () => {
        history.replaceState(null, '', '/a');
        createRouter(ROUTES);
        offs.push(onBeforeNavigate(async () => true));
        navigate('/b');
        expect(currentPath()).toBe('/a');
        await new Promise(r => setTimeout(r, 0));
        expect(currentPath()).toBe('/b');
    });
});
