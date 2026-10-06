// The router reports to __PDX_DEVTOOLS__ v1: the current route and the last navigations, for an
// agent that asks a running app where it is.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter, destroyRouter, navigate } from '../src/runtime';
import type { RouteConfig } from '../src/runtime';

interface Api {
    route(): { path: string; params: Record<string, string>; query: Record<string, string>; matched: string | null } | null;
    navigations(): { time: number; from: string; to: string; matched: string | null; error: string | null }[];
}
const api = (): Api => (window as unknown as { __PDX_DEVTOOLS__: Api }).__PDX_DEVTOOLS__;

const tick = () => new Promise((r) => setTimeout(r, 0));
const page = () => () => document.createElement('div');
const routes: RouteConfig[] = [
    { path: '/', component: page() },
    { path: '/users/:id', component: page() },
];

beforeEach(() => {
    destroyRouter();
    history.replaceState(null, '', '/');
});

describe('__PDX_DEVTOOLS__ and the router', () => {
    it('route() is where the app is: path, params, query, and the route that matched', async () => {
        createRouter(routes);
        navigate('/users/7?tab=bills');
        await tick();
        expect(api().route()).toEqual({ path: '/users/7', params: { id: '7' }, query: { tab: 'bills' }, matched: '/users/:id' });
    });

    it('navigations() lists a navigation that finished, with where it came from', async () => {
        createRouter(routes);
        await tick();
        navigate('/users/7');
        await tick();
        expect(api().navigations().at(-1)).toMatchObject({ from: '/', to: '/users/7', matched: '/users/:id', error: null });
    });

    it('and one that found nothing, as a 404', async () => {
        createRouter(routes);
        navigate('/nowhere');
        await tick();
        expect(api().navigations().at(-1)).toMatchObject({ to: '/nowhere', matched: null, error: '404' });
        expect(api().route()).toMatchObject({ path: '/nowhere', matched: null });
    });
});
