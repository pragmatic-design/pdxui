// The current path, held where a component can read it without the router (#1023).
//
// `pdx-app-shell` lights the navigation entry of the page in front of you and notes the lists you
// open. It needs the current path, and `@pdxui/ui` depends on core alone. So core holds a registry,
// the arrangement `routeTrail` uses for `pdx-breadcrumb`: the router names its own path as the source
// when it loads, and a component reads `locationPath()`. An app with no router reads the address
// bar, and follows the back and forward buttons.
//
// This file measures the registry. That the router fills it is
// `packages/router/tests/location-path.test.ts`.

import { describe, it, expect, afterEach } from 'vitest';
import { locationPath, setLocationSource } from '../src/navigation/location-path';
import { signal, effect } from '../src/reactivity/signal';

afterEach(() => setLocationSource(null));

describe('the location path registry', () => {
    it('without a source, it is the address bar\'s path', () => {
        history.replaceState(null, '', '/tickets');
        setLocationSource(null);
        expect(locationPath()).toBe('/tickets');
    });

    it('without a source, the back and forward buttons are followed', () => {
        history.replaceState(null, '', '/a');
        setLocationSource(null);
        const seen: string[] = [];
        const stop = effect(() => { seen.push(locationPath()); });
        history.pushState(null, '', '/b');
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(seen).toEqual(['/a', '/b']);
        stop();
    });

    it('with a source, it reads the source, and a reader re-runs when the source changes', () => {
        const path = signal('/customers');
        setLocationSource(() => path());
        const seen: string[] = [];
        const stop = effect(() => { seen.push(locationPath()); });
        path.set('/customers/7');
        // A shell that had to be told to look again would light yesterday's entry.
        expect(seen).toEqual(['/customers', '/customers/7']);
        stop();
    });

    it('a reader made before the source arrives follows it once it does', () => {
        history.replaceState(null, '', '/before');
        setLocationSource(null);
        const seen: string[] = [];
        const stop = effect(() => { seen.push(locationPath()); });
        const path = signal('/after');
        setLocationSource(() => path());
        expect(seen).toEqual(['/before', '/after']);
        stop();
    });
});
