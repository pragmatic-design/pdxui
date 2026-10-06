// The build-time route table carries everything the outlet needs.
//
// The outlet does not learn what routes exist from `globalThis.__pdx_routes`, which a page module
// fills WHEN IT IS IMPORTED: the app would have to import every page before the router knew any of
// them existed, the entry would contain the whole application, and `@page`'s code splitting could
// not happen — the dynamic import the outlet performs would resolve to a module already in the entry.
//
// The generated router carries the table. Every field the outlet reads has to be in it, and a
// field that is missing is not an error: it is a page that renders in dev with a transition, or a
// keep-alive, or a scroll behaviour, and without it in a production build — a field dropped by a
// mapping that nothing compares.
//
// The scan calls `analyzeScript`, the same analyser the codegen calls, so the two cannot read a
// declaration differently. This is the assertion that it keeps doing so.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanForRoutes, generateOptimizedRouter, type ScannedRoute } from '../src/plugin-utils';

const PAGE = `
<template>
  <section>A ticket</section>
  <pdx-router-outlet />
</template>

<script setup>
@page '/tickets/:id';
@alias '/cases/:id';
@guard 'tickets.read';
@transition 'fade';
@scroll 'top';
@prefetch 'hover';
@meta { breadcrumb: 'Ticket' };
</script>`;

const EAGER = `
<template><section>Home</section></template>

<script setup>
@page '/' { preload: true };
</script>`;

let dir: string;
let routes: ScannedRoute[];

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pdx-scan-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'ticket.pdx'), PAGE);
    writeFileSync(join(dir, 'src', 'home.pdx'), EAGER);
    routes = [];
    scanForRoutes(join(dir, 'src'), routes);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ticket = (): ScannedRoute => routes.find(r => r.path === '/tickets/:id')!;

describe('the scan reads the whole declaration', () => {
    it('finds the page and its alias as two routes', () => {
        // An alias registered by the codegen and missed by the scan is a route that is a page in
        // dev and a 404 in production, as `@page 'a', 'b'` would be.
        expect(routes.map(r => r.path).sort()).toEqual(['/', '/cases/:id', '/tickets/:id']);
    });

    it('carries what the ROUTER needs', () => {
        const t = ticket();
        expect(t.tag).toBe('pdx-ticket');
        expect(t.guard).toBe('tickets.read');
        expect(t.meta).toEqual({ breadcrumb: 'Ticket' });
    });

    it('carries what the OUTLET needs to render the page', () => {
        const t = ticket();
        expect(t.transition, 'a page would lose its transition in a production build').toBe('fade');
        expect(t.scroll, 'a page would lose its @scroll').toBe('top');
        expect(t.prefetch).toBe('hover');
        expect(t.hasOutlet, 'the page renders a child outlet and the table does not say so').toBe(true);
    });

    it('marks a page as its own chunk, with the file to import', () => {
        const t = ticket();
        expect(t.lazy, 'the page is not lazily loaded, so it stays in the entry').toBe(true);
        expect(t.file).toMatch(/ticket\.pdx$/);
    });

    it('and respects preload: a page that opts out is not split', () => {
        const home = routes.find(r => r.path === '/')!;
        expect(home.preload).toBe(true);
        expect(home.lazy, 'a preloaded page was split anyway').toBeFalsy();
    });
});

describe('the generated router emits what the scan found', () => {
    const source = (): string => generateOptimizedRouter(routes);

    it('every field reaches the emitted table', () => {
        const js = source();
        for (const fragment of ['"/tickets/:id"', 'guard: "tickets.read"', 'transition: "fade"',
            'scroll: "top"', 'prefetch: "hover"', 'hasOutlet: true', 'lazy: true']) {
            expect(js, `the table does not carry ${fragment}`).toContain(fragment);
        }
    });

    it('a lazy page gets an import with a LITERAL specifier', () => {
        // The literal is the whole mechanism. `import(config.file)` with a runtime string is what
        // the outlet used to do, and Rollup does not analyse it — so no chunk was ever produced and
        // the split was invisible. A page must appear inside an `import("…")` here.
        const js = source();
        expect(js).toMatch(/import\("[^"]*ticket\.pdx"\)/);
    });

    it('and a preloaded page does not', () => {
        expect(source(), 'a page that opted out of splitting got a chunk anyway')
            .not.toMatch(/import\("[^"]*home\.pdx"\)/);
    });

    it('the table is reachable as a function, not only as a const', () => {
        // `routeTable()` is what the outlet calls through the seam; the interpreted router answers
        // null and the outlet falls back to the module registrations.
        expect(source()).toContain('export function routeTable()');
        expect(source()).toContain('export function pageModule(');
    });
});
