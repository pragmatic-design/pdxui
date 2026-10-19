// Typed routes in the compiler (#150): `.pdx/routes.d.ts` from the `@page` patterns — written by the
// plugin's build start, only when it changes — and the registry entries `pdx migrate` applies to
// `navigate(string)`. The runtime is packages/router/tests/typed-routes.test.ts, the types in the
// editor packages/lsp/tests/typed-routes.test.ts.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { routeKey, routeParamsType, routeTypesDts, writeRouteTypes, projectRoutePatterns, ROUTE_TYPES_FILE } from '../src/route-types';
import { navigateUrl, navigateUrlManual } from '../src/language/navigate-url';
import { pdx } from '../src/plugin';

const fix = (c: { fix: unknown }, text: string, ctx?: object) => (c.fix as (t: string, c?: object) => string)(text, ctx);
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'pdx-routes-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('the route types', () => {
    it('keys a pattern without its constraints and types its params from them', () => {
        expect(routeKey('/users/:id(number)/:tab')).toBe('/users/:id/:tab');
        expect(routeParamsType('/users/:id(number)/:slug(slug)/:u(uuid)')).toBe('{ id: number; slug: string; u: string }');
        expect(routeParamsType('/')).toBe('{}');
    });

    it('reads a hostile pattern as the matcher does: each constraint ends at the first `)`', () => {
        // `:A(` then `:A((` repeated: what made a regex for a param and its constraint polynomial
        // (CodeQL js/polynomial-redos). Its time is measured in tests/perf/compiler-scans.test.ts.
        const hostile = `/:A(${':A(('.repeat(3)}`;
        expect(routeKey(hostile)).toBe(hostile);
        expect(routeParamsType('/:id(number)/:x((a)/:y')).toBe('{ id: number; x: string; y: string }');
        expect(routeKey('/:id(number)/:x((a)/:y')).toBe('/:id/:x/:y');
    });

    it('augments RouteRegistry, sorted, a wildcard left out', () => {
        const dts = routeTypesDts(['/users/:id(number)', '/', '/docs/*']);
        expect(dts).toContain("declare module '@pdxui/router'");
        expect(dts).toContain('"/": {};');
        expect(dts).toContain('"/users/:id": { id: number };');
        expect(dts).not.toContain('/docs');
        expect(dts.indexOf('"/"')).toBeLessThan(dts.indexOf('"/users/:id"'));
    });

    it('is written only when its text changes', () => {
        const root = tmp();
        expect(writeRouteTypes(root, ['/a'])).toBe(true);
        const first = statSync(join(root, ROUTE_TYPES_FILE)).mtimeMs;
        expect(writeRouteTypes(root, ['/a']), 'the same routes rewrote the file').toBe(false);
        expect(statSync(join(root, ROUTE_TYPES_FILE)).mtimeMs).toBe(first);
        expect(writeRouteTypes(root, ['/a', '/b'])).toBe(true);
    });
});

describe('the plugin writes it', () => {
    const page = (path: string) => `<template><p>x</p></template>\n<script>\n@page '${path}';\n</script>\n`;

    it('at build start, from the pages it scans', () => {
        const root = tmp();
        mkdirSync(join(root, 'src', 'pages'), { recursive: true });
        writeFileSync(join(root, 'src', 'pages', 'user.pdx'), page('/users/:id(number)'));
        writeFileSync(join(root, 'src', 'pages', 'home.pdx'), page('/'));
        const plugin = pdx()[0] as unknown as { configResolved(c: { root: string; command: string }): void; buildStart(this: { warn(): void }): void };
        plugin.configResolved({ root, command: 'build' });
        plugin.buildStart.call({ warn() {} });
        const dts = readFileSync(join(root, ROUTE_TYPES_FILE), 'utf-8');
        expect(dts).toContain('"/users/:id": { id: number };');
        expect(dts).toContain('"/": {};');
        expect(projectRoutePatterns(root).sort()).toEqual(['/', '/users/:id']);
    });

    it('control — an app with no route gets no file', () => {
        const root = tmp();
        mkdirSync(join(root, 'src'), { recursive: true });
        const plugin = pdx()[0] as unknown as { configResolved(c: { root: string; command: string }): void; buildStart(this: { warn(): void }): void };
        plugin.configResolved({ root, command: 'build' });
        plugin.buildStart.call({ warn() {} });
        expect(() => statSync(join(root, ROUTE_TYPES_FILE))).toThrow();
    });
});

describe('pdx migrate: navigate(string) → navigate.url(string)', () => {
    const routes = { routePatterns: new Set(['/', '/dashboard', '/users/:id']) };
    const script = [
        "import { navigate } from '@pdxui/router';",
        "navigate('/users/42');",
        "navigate('/dashboard');",
        "navigate('/users/:id', { id: 1 });",
        "navigate('/tickets?status=open');",
        'navigate(`/assets/${id}`);',
        'navigate(href);',
        "navigate('/x/1', undefined, { from: 'list' });",
    ].join('\n');

    it('rewrites a literal URL, leaves a declared pattern, and a second run changes nothing', () => {
        expect(navigateUrl.detect(script, routes).map((f) => f.found)).toEqual(["navigate('/users/42')", "navigate('/tickets?status=open')"]);
        const fixed = fix(navigateUrl, script, routes);
        expect(fixed).toContain("navigate.url('/users/42');");
        expect(fixed).toContain("navigate.url('/tickets?status=open');");
        expect(fixed, 'a declared pattern was turned into a URL').toContain("navigate('/dashboard');");
        expect(fixed).toContain("navigate('/users/:id', { id: 1 });");
        expect(navigateUrl.detect(fixed, routes)).toEqual([]);
    });

    it('flags what a person decides: a computed URL, a variable, a URL with more arguments', () => {
        expect(navigateUrlManual.detect(script, routes).map((f) => f.found)).toEqual([
            'navigate(`/assets/${id}`)', 'navigate(href)', "navigate('/x/1', undefined, { from: 'list' })",
        ]);
        expect(navigateUrlManual.fix).toBe('flag');
    });

    it('without the project\'s routes, only a literal with a query or a hash is surely a URL', () => {
        expect(navigateUrl.detect(script).map((f) => f.found)).toEqual(["navigate('/tickets?status=open')"]);
    });

    it('control — a file with a navigate of its own is not the router\'s', () => {
        const own = "function navigate(delta: number): void { step(delta); }\nnavigate(-1);\nnavigate('/x?y');\n";
        expect(navigateUrl.detect(own, routes)).toEqual([]);
        expect(navigateUrlManual.detect(own, routes)).toEqual([]);
        const method = "class Cal { navigate(delta, unit) { this.go(delta); } }\nbtn.onclick = () => navigate(1, 'month');\n";
        expect(navigateUrlManual.detect(method, routes)).toEqual([]);
    });
});
