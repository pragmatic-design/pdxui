// How the route table reaches a @loader.
//
// A route table is data built by scanning the sources, and it must not import the page modules
// statically — that would put every page in the entry chunk, which is the code splitting `@page`
// exists to keep. So a function declared in a page cannot be written into it.
//
// The answer: the table carries a BRIDGE per route that declares a loader. It takes the function
// from the registration the page module publishes into `globalThis.__pdx_routes` when it has been
// imported. On the first visit it has not, and the bridge imports the loader's OWN module
// (`virtual:pdx-loader/<tag>`, #119), so the data does not wait for the page's chunk; only when the
// loader cannot stand alone — it reads a name its script declares beside it — does that module hold
// nothing, and the bridge imports the page instead. Both through literal `import()`s the bundler can
// see and split.
//
// The behaviour suite (packages/router/tests/parity.test.ts) runs the loader rows against the table.
// This file pins what is emitted and the paths those rows do not take: the lazy first visit, and a
// declared loader that resolves to nothing.

import { describe, it, expect, afterEach } from 'vitest';
import { scanForRoutes, type ScannedRoute } from '../src/plugin-utils';
import { generateRouteTable } from '../src/route-table';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA: ScannedRoute = { path: '/data', file: '/app/pages/data.pdx', tag: 'pdx-data', loader: 'loadRows' };
const PLAIN: ScannedRoute = { path: '/about', file: '/app/pages/about.pdx', tag: 'pdx-about' };

type TableRoute = { path: string; loader?: () => Promise<unknown> };

/**
 * Evaluate the table module. `import(` is routed through `importer`, so a test decides what loading
 * the page does — `new Function` has no module loader of its own.
 */
function evaluate(routes: ScannedRoute[], importer: (spec: string) => Promise<unknown>): TableRoute[] {
    const body = generateRouteTable(routes)
        .replace(/^export\s+/gm, '')
        .replace(/\bimport\(/g, '__import(');
    return new Function('__import', `${body}\nreturn routes;`)(importer) as TableRoute[];
}

const neverImported = (spec: string): Promise<unknown> => Promise.reject(new Error(`imported ${spec}`));

/** The loader's own module holds nothing (it needs its page); every other import is `page`. */
const noOwnModule = (page: (spec: string) => Promise<unknown>) => (spec: string): Promise<unknown> =>
    spec.startsWith('virtual:pdx-loader/') ? Promise.resolve({ default: null }) : page(spec);

afterEach(() => {
    delete (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes;
});

describe('what the table carries', () => {
    it('carries a bridge on the route, never the name as a value to call', () => {
        const code = generateRouteTable([DATA]);

        expect(code, 'the bridge did not reach the route entry').toContain(
            'loader: (ctx) => __load("/data", () => import("/app/pages/data.pdx"), "loadRows", () => import("virtual:pdx-loader/pdx-data"), ctx)');
        // A string where the router expects a function is a call on a string.
        expect(code).not.toContain('loader: "loadRows"');
    });

    it('imports the page with a LITERAL specifier', () => {
        // A literal is what lets the bundler split the chunk. A runtime-computed specifier would
        // make the import unanalysable and pull the page into the main bundle, or nothing at all.
        expect(generateRouteTable([DATA])).toContain('import("/app/pages/data.pdx")');
    });

    it('emits no loader for a route that declares none', () => {
        const code = generateRouteTable([PLAIN]);

        expect(code, 'a route with no loader pulled its page module into the table')
            .not.toContain('about.pdx');
        expect(evaluate([PLAIN], neverImported)[0].loader).toBeUndefined();
    });
});

describe('how the function is found', () => {
    it('takes it from the registration the page module published', async () => {
        const [route] = evaluate([DATA], neverImported);
        (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes = [{ path: '/data', loader: async () => ({ rows: 2 }) }];

        expect(await route.loader!()).toEqual({ rows: 2 });
    });

    it('imports the loader\'s own module when nothing has registered yet, and not the page', async () => {
        const imported: string[] = [];
        const [route] = evaluate([DATA], async (spec) => {
            imported.push(spec);
            if (spec.startsWith('virtual:pdx-loader/')) return { default: async () => 'own' };
            throw new Error(`imported ${spec}`);
        });

        expect(await route.loader!()).toBe('own');
        expect(imported, 'the data waited for the page module').toEqual(['virtual:pdx-loader/pdx-data']);
    });

    it('imports the page module when the loader has no module of its own — the lazy first visit', async () => {
        const imported: string[] = [];
        const [route] = evaluate([DATA], noOwnModule(async (spec) => {
            imported.push(spec);
            // What a compiled page module does when it loads.
            (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes = [{ path: '/data', loader: async () => 'fresh' }];
        }));

        expect(await route.loader!()).toBe('fresh');
        expect(imported).toEqual(['/app/pages/data.pdx']);
    });

    it('hands the router\'s context to the loader it finds (#505)', async () => {
        const seen: unknown[] = [];
        const [route] = evaluate([DATA], neverImported);
        (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes = [{ path: '/data', loader: async (ctx: unknown) => { seen.push(ctx); return 1; } }];
        const ctx = { params: { id: 1 }, query: {}, signal: new AbortController().signal };

        await (route.loader as unknown as (c: unknown) => Promise<unknown>)(ctx);
        expect(seen, 'the bridge dropped the context').toEqual([ctx]);
    });

    it('ignores a registration whose loader is not callable', async () => {
        // A loader emitted as a STRING and called anyway is a call on a string. The bridge goes on to
        // import the page instead — which, here, is the rejection that proves it did.
        const [route] = evaluate([DATA], noOwnModule(neverImported));
        (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes = [{ path: '/data', loader: 'loadRows' }];

        await expect(route.loader!()).rejects.toThrow('imported /app/pages/data.pdx');
    });

    it('names the loader when the page module registered none', async () => {
        const [route] = evaluate([DATA], noOwnModule(async () => { /* a page that registers nothing */ }));

        await expect(route.loader!()).rejects.toThrow('@loader "loadRows" is declared on /data but the page module registered none');
    });
});

describe('scanForRoutes reads @loader', () => {
    const dirs: string[] = [];
    const scan = (source: string): ScannedRoute[] => {
        const dir = mkdtempSync(join(tmpdir(), 'pdx-loader-'));
        dirs.push(dir);
        writeFileSync(join(dir, 'page.pdx'), source, 'utf-8');
        const routes: ScannedRoute[] = [];
        scanForRoutes(dir, routes);
        return routes;
    };

    afterEach(() => {
        for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    });

    it('picks the name up from a page that declares one', () => {
        const [r] = scan("<script>\n@page '/data';\n@loader rowData: loadRows;\nasync function loadRows() { return 1; }\n</script>");

        expect(r.loader).toBe('loadRows');
    });

    it('leaves it undefined on a page that declares none', () => {
        // The control: a scanner that returned a name unconditionally would satisfy the case above.
        const [r] = scan("<script>\n@page '/about';\n</script>");

        expect(r.loader).toBeUndefined();
    });

    it('does not read the word out of a sentence in a comment', () => {
        const [r] = scan("<script>\n@page '/about';\n// the @loader loadRows story is told elsewhere\n</script>");

        expect(r.loader).toBeUndefined();
    });
});

