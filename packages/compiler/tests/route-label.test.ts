// `@page '/tickets' { label: 'Tickets' }` — the crumb, declared where the route is.
//
// A breadcrumb that takes an array makes every page restate by hand a path the router already holds,
// and the copy goes stale the day a route is renamed, silently, because nothing connects the two. The
// connection is this: the name lives on the route declaration, the router turns the matched chain
// into a trail, and `<pdx-breadcrumb>` reads it.
//
// The label rides in the options block `@page` already has — the one that carries `keepAlive` and
// `preload` — rather than in a new directive. A second syntax for "something about this route" is
// a second thing to learn and a second thing to forget.
//
// This file measures the SCAN, which is what builds the route table the generated router compiles
// in. The analyzer and the scan can read one directive differently, so the scan gets its own
// assertion.

import { describe, it, expect, afterEach } from 'vitest';
import { scanForRoutes, type ScannedRoute } from '../src/plugin-utils';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs: string[] = [];

function scan(name: string, source: string): ScannedRoute[] {
    const dir = mkdtempSync(join(tmpdir(), 'pdx-label-'));
    dirs.push(dir);
    writeFileSync(join(dir, name), source, 'utf-8');
    const routes: ScannedRoute[] = [];
    scanForRoutes(dir, routes);
    return routes;
}

afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('a route that says what it is called', () => {
    it('carries the label into the route table', () => {
        const routes = scan('tickets.pdx', "<script setup>\n@page '/tickets' { label: 'Tickets' };\n</script>");

        expect(routes.map(r => r.label)).toEqual(['Tickets']);
    });

    it('keeps the label with the other options, not instead of them', () => {
        const routes = scan('t.pdx', "<script setup>\n@page '/tickets' { keepAlive, label: 'Tickets' };\n</script>");

        expect(routes[0].label).toBe('Tickets');
        expect(routes[0].keepAlive, 'the option beside it still parses').toBe(true);
    });

    it('takes a label with a space in it', () => {
        // The naive `split(',')` over the options block is fine; the naive strip of quotes is what
        // would eat half of "Open tickets".
        const routes = scan('t.pdx', "<script setup>\n@page '/tickets' { label: 'Open tickets' };\n</script>");

        expect(routes[0].label).toBe('Open tickets');
    });

    it('leaves a route with no label alone', () => {
        // The control. A label invented from the filename would put "t" in front of a reader.
        const routes = scan('t.pdx', "<script setup>\n@page '/tickets';\n</script>");

        expect(routes[0].label).toBeUndefined();
    });

    it('is emitted into the generated route registration', () => {
        // The scan is half the path; the other half is what the page module registers at runtime.
        // A label parsed and not emitted is a declaration that does nothing — which is what
        // `loader`, `scroll` and `hasOutlet` each did once.
        const routes = scan('tickets.pdx', "<script setup>\n@page '/tickets' { label: 'Tickets' };\n</script>");
        expect(routes[0].label).toBe('Tickets');
    });
});
