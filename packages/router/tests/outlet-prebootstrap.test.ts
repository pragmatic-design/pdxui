// The outlet renders when the router has ALREADY resolved a route.
//
// The router resolves nothing until `createRouter`, which the outlet itself calls from a microtask
// in `connectedCallback`. So when the outlet starts it, the effect's first, synchronous run sees
// `currentRoute() === null` and does nothing; the microtask does the real work, after
// `autoInitRouter` has filled `routeConfigMap` from the route table.
//
// An app may start the router itself, before the outlet connects — `createRouterFromTable` — and
// then by the time the effect first runs there IS a route, and no `routeConfigMap`, because the
// microtask has not gone yet. Taking the route through activation with an empty `routeConfigMap`
// fails when the route config is table data with no `component` closure to fall back on. It throws
// inside an async activation (an unhandled rejection, nothing in the console) having already set
// `_previousRoute`, so the microtask's second call hits the same-path early return and the page
// stays blank forever.
//
// The guard for the null case is the same guard this needs: before the table lands,
// nothing is renderable — not a null route, and not a matched one either.

import { describe, it, expect, beforeAll } from 'vitest';
import { setPermissions } from '@pdxui/core';

for (const tag of ['pdx-pb-home', 'pdx-pb-other']) {
    customElements.define(tag, class extends HTMLElement {});
}

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-pb-home' },
    { path: '/other', tag: 'pdx-pb-other' },
];

import { createRouter, navigate } from '../src/runtime';
import type { RouteConfig } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * A route table's shape: `{ path, tag }` and nothing callable.
 *
 * The cast is the point of the test rather than a way around the type. `RouteConfig.component` is a
 * closure `toRouteConfig` puts there; the table itself is compiled from `@page` declarations, where
 * a function cannot travel. The outlet must render from the tag, not from the closure.
 */
const GENERATED_SHAPE = [
    { path: '/', tag: 'pdx-pb-home' },
    { path: '/other', tag: 'pdx-pb-other' },
] as unknown as RouteConfig[];

let outlet: HTMLElement;

beforeAll(async () => {
    setPermissions([]);
    history.replaceState(null, '', '/');
    // The router resolves BEFORE the outlet exists — an app that started it itself.
    createRouter(GENERATED_SHAPE);
    await tick();

    outlet = document.createElement('pdx-router-outlet');
    document.body.appendChild(outlet);
    await tick();
});

describe('an outlet mounted after the router already resolved', () => {
    it('renders the page for the route that was already matched', () => {
        expect(outlet.querySelector('pdx-pb-home'),
            'the outlet activated before the route table existed and never recovered').not.toBeNull();
    });

    it('shows no error page — the route matched', () => {
        // The other way this failed: rendering a 404 for a route that had resolved perfectly well.
        expect(outlet.textContent ?? '').not.toContain('Page not found');
    });

    it('still follows a later navigation', async () => {
        // The control: an outlet that renders once and then stops is not fixed. And it proves the
        // first assertion is not passing because everything is rendered eagerly.
        navigate('/other');
        await tick();

        expect(outlet.querySelector('pdx-pb-other')).not.toBeNull();
        expect(outlet.querySelector('pdx-pb-home')).toBeNull();
    });
});
