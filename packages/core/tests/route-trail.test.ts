// The trail a breadcrumb shows, held where both halves can reach it.
//
// `<pdx-breadcrumb>` takes `items` as an array, so every page restates by hand a path the router
// already holds — and the copy goes stale the day a route is renamed, silently, because nothing
// connects the two.
//
// Connecting them directly is not available: `@pdxui/ui` does not depend on `@pdxui/router`
// and must not start — CONTRIBUTING.md says ui depends on core alone.
// So the trail lives in CORE as a registry, exactly the shape `setLocaleStrings` already
// uses for the library's own strings: core holds it, the router fills it, a component reads it.
// Both halves keep their dependency on core alone.
//
// This file measures the registry. That the router fills it correctly is
// `packages/router/tests/route-trail.test.ts`; that the component reads it is
// `packages/ui/tests/unit/breadcrumb-route.test.ts`.

import { describe, it, expect, beforeEach } from 'vitest';
import { routeTrail, setRouteTrail, clearRouteTrail } from '../src/navigation/route-trail';
import { effect } from '../src/reactivity/signal';

describe('the route trail registry', () => {
    beforeEach(() => clearRouteTrail());

    it('starts empty, so a breadcrumb with no router renders nothing rather than guessing', () => {
        expect(routeTrail()).toEqual([]);
    });

    it('holds what the router puts in it', () => {
        setRouteTrail([
            { label: 'Tickets', href: '/tickets', current: false },
            { label: 'T-1042', href: '/tickets/42', current: true },
        ]);

        expect(routeTrail().map(c => c.label)).toEqual(['Tickets', 'T-1042']);
        expect(routeTrail()[1].current).toBe(true);
    });

    it('is a signal: a reader re-runs when the route changes', () => {
        const seen: number[] = [];
        const stop = effect(() => { seen.push(routeTrail().length); });

        setRouteTrail([{ label: 'Tickets', href: '/tickets', current: true }]);
        setRouteTrail([
            { label: 'Tickets', href: '/tickets', current: false },
            { label: 'T-1042', href: '/tickets/42', current: true },
        ]);

        // A breadcrumb that had to be told to re-read would be the same stale copy in a new place.
        expect(seen).toEqual([0, 1, 2]);
        stop();
    });

    it('clearing it empties the trail, for a page that leaves the router behind', () => {
        setRouteTrail([{ label: 'Tickets', href: '/tickets', current: true }]);
        clearRouteTrail();
        expect(routeTrail()).toEqual([]);
    });
});
