// The router hands __PDX_DEVTOOLS__.map() its route graph (#272): each route's pattern, its params
// and their types, its title, its guard, and whether the current user can enter it.

import { describe, it, expect, beforeEach } from 'vitest';
import { loadTranslations } from '@pdxui/core';
import { createRouter, destroyRouter, registerGuardChecker } from '../src/runtime';
import type { RouteConfig } from '../src/runtime';
import { paramsOf } from '../src/devtools-map';

interface MapRoute { path: string; params?: { name: string; type: string }[]; title?: string; guard?: string; access?: boolean; redirect?: string }
const map = (): MapRoute[] => (window as unknown as { __PDX_DEVTOOLS__: { map(): MapRoute[] } }).__PDX_DEVTOOLS__.map();

const page = () => () => document.createElement('div');

beforeEach(() => {
    destroyRouter();
    registerGuardChecker((name) => name !== 'billing');
    history.replaceState(null, '', '/');
});

describe('__PDX_DEVTOOLS__.map()', () => {
    it('lists every route with its params and their types', () => {
        createRouter([
            { path: '/', component: page() },
            { path: '/users/:id(number)', component: page() },
            { path: '/keys/:key(uuid)', component: page() },
            { path: '/codes/:code([A-Z]{3})/:slug', component: page() },
            { path: '/files/*', component: page() },
        ]);
        expect(map()).toEqual([
            { path: '/' },
            { path: '/users/:id(number)', params: [{ name: 'id', type: 'number' }] },
            { path: '/keys/:key(uuid)', params: [{ name: 'key', type: 'uuid' }] },
            { path: '/codes/:code([A-Z]{3})/:slug', params: [{ name: 'code', type: '[A-Z]{3}' }, { name: 'slug', type: 'string' }] },
            { path: '/files/*', params: [{ name: '$rest', type: 'string' }] },
        ]);
    });

    it('reads a hostile pattern in linear time', () => {
        // `:0(` then `:0((` repeated: what made a regex scan polynomial (#67, CodeQL).
        const hostile = (n: number) => `/:0(${':0(('.repeat(n)}`;
        // The fastest of five runs (#538): load only ever adds time, so the minimum is the scan's own cost.
        const fastest = (n: number): number => {
            const path = hostile(n);
            let best = Infinity;
            for (let i = 0; i < 5; i++) {
                const started = performance.now();
                paramsOf(path);
                best = Math.min(best, performance.now() - started);
            }
            return best;
        };
        // The GROWTH, not a time (#700): load slows both sizes alike, and an absolute bound measured the
        // machine. Four times the input: a linear scan takes about four times as long, a quadratic one
        // about sixteen. Twice the input did not tell them apart: a quadratic scan measured 2.9.
        const small = fastest(25_000);
        const large = fastest(100_000);
        expect(large / small, `25 000 → ${small.toFixed(1)} ms, 100 000 → ${large.toFixed(1)} ms`).toBeLessThan(8);
        // A loose ceiling, for a scan that became uniformly very slow.
        expect(large).toBeLessThan(2000);
        expect(paramsOf(hostile(10)).length).toBe(11);
    });

    it('each constraint is read to its own `)`, after the remembered one is passed (#700)', () => {
        expect(paramsOf('/a/:x(n)/b/:y([0-9]+)/:z')).toEqual([
            { name: 'x', type: 'n' }, { name: 'y', type: '[0-9]+' }, { name: 'z', type: 'string' },
        ]);
    });

    it('a `*` inside a constraint is the constraint\'s, not a rest param', () => {
        expect(paramsOf('/a/:x(.*)/b')).toEqual([{ name: 'x', type: '.*' }]);
    });

    it('names a route by its crumb: a dictionary key translated, else a written label', () => {
        loadTranslations('en', { devtoolsMap: { customers: 'Customers' } });
        createRouter([
            { path: '/customers', component: page(), labelKey: 'devtoolsMap.customers' },
            // A key whose strings have not arrived is no title: the key is not a name.
            { path: '/later', component: page(), labelKey: 'devtoolsMap.notLoaded' },
            { path: '/about', component: page(), label: 'About us' },
            // A function label needs the record it names: a map has none, so no title.
            { path: '/tickets/:id', component: page(), label: (p) => `Ticket ${p.id}` },
        ]);
        expect(map().map((r) => r.title)).toEqual(['Customers', undefined, 'About us', undefined]);
    });

    it('a route with no crumb is named by its page title: a key once its strings are loaded, or a string (#389)', () => {
        loadTranslations('en', { devtoolsMap: { intake: 'New ticket', crumb: 'Crumb' } });
        createRouter([
            { path: '/intake', component: page(), titleKey: 'devtoolsMap.intake' },
            { path: '/unloaded', component: page(), titleKey: 'devtoolsMap.titleNotLoaded' },
            { path: '/board', component: page(), title: 'Board' },
            // The crumb wins: it is what the route is called where the app names it.
            { path: '/both', component: page(), labelKey: 'devtoolsMap.crumb', titleKey: 'devtoolsMap.intake' },
        ]);
        expect(map().map((r) => r.title)).toEqual(['New ticket', undefined, 'Board', 'Crumb']);
    });

    it('a guarded route says whether the current user may enter it', () => {
        createRouter([
            { path: '/account', component: page(), guard: 'account' },
            { path: '/billing', component: page(), guard: 'billing' },
        ]);
        expect(map()).toEqual([
            { path: '/account', guard: 'account', access: true },
            { path: '/billing', guard: 'billing', access: false },
        ]);
    });

    it('a route inside a guarded parent is closed when the parent is', () => {
        const routes: RouteConfig[] = [
            { path: '/billing', component: page(), guard: 'billing', hasOutlet: true },
            { path: '/billing/invoices', component: page() },
        ];
        createRouter(routes);
        expect(map()[1]).toEqual({ path: '/billing/invoices', access: false });
    });

    it('a redirect says where it goes', () => {
        createRouter([{ path: '/old', component: page(), redirect: '/new' }, { path: '/new', component: page() }]);
        expect(map()[0]).toEqual({ path: '/old', redirect: '/new' });
    });
});
