// How the generated router runs a @loader.
//
// The runtime router's way cannot be copied, because the two routers get their routes from
// different places: the runtime one reads
// `globalThis.__pdx_routes`, which each compiled page pushes to when it is imported and which can
// therefore carry a live function; the generated one is `virtual:pdx-router`, built from
// `ScannedRoute` — serialisable data only — and it does not import the page modules, because
// importing them statically is exactly the code splitting it exists to keep.
//
// The answer: the generated module carries the loader's NAME, and takes the FUNCTION from the same
// registration the runtime router reads. For a lazily loaded route that registration does not exist
// yet on the first visit, so the module imports the page first, from
// a table of literal `import()` specifiers the bundler can see and split.
//
// The parity table (packages/router/tests/parity.test.ts) proves the BEHAVIOUR against both routers.
// This file pins what is emitted and the paths the parity row does not take: the lazy first visit,
// and a declared loader that resolves to nothing.

import { describe, it, expect, afterEach } from 'vitest';
import { generateOptimizedRouter, scanForRoutes, type ScannedRoute } from '../src/plugin-utils';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA: ScannedRoute = { path: '/data', file: '/app/pages/data.pdx', tag: 'pdx-data', loader: 'loadRows' };
const PLAIN: ScannedRoute = { path: '/about', file: '/app/pages/about.pdx', tag: 'pdx-about' };

/** A stub of the two core symbols the module reads at load time, with real signal semantics. */
function coreStub() {
    return {
        signal: (initial: unknown) => {
            let v = initial;
            const s = () => v;
            return Object.assign(s, { set: (n: unknown) => { v = n; }, peek: () => v });
        },
        computed: (fn: () => unknown) => fn,
        sanitizeUrl: (u: string) => u,
        saveScrollPosition: () => {},
        restoreScrollPosition: () => {},
    };
}

/**
 * Evaluate the generated module and hand back the private pieces this file needs.
 *
 * `_resolveLoader` is module-private on purpose — it is not part of the router's surface — so the
 * tail exports it for the test rather than the module exporting it for everyone.
 */
function evaluate(routes: ScannedRoute[]) {
    const body = generateOptimizedRouter(routes)
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
        .replace(/^\s*export\s+/gm, '');
    return new Function('__core', `${body}\nreturn { _resolveLoader, _registeredLoader, currentLoaderState, currentLoaderData };`)(coreStub()) as {
        _resolveLoader: (c: { path: string; loader?: string }) => Promise<(() => Promise<unknown>) | null>;
        _registeredLoader: (p: string) => (() => Promise<unknown>) | null;
        currentLoaderState: () => string;
        currentLoaderData: () => unknown;
    };
}

afterEach(() => {
    delete (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes;
});

describe('what the generated module carries', () => {
    it('carries the loader NAME on the route, not a function', () => {
        const code = generateOptimizedRouter([DATA]);

        expect(code, 'the name did not reach the route entry').toContain('loader: "loadRows"');
        // The generated module has no function to embed.
        expect(code).not.toContain('loader: loadRows');
    });

    it('emits one import() with a LITERAL specifier for the page that declares it', () => {
        const code = generateOptimizedRouter([DATA]);

        // A literal is what lets the bundler split the chunk. A runtime-computed specifier would
        // make the import unanalysable and pull the page into the main bundle, or nothing at all.
        expect(code).toContain('"/data": () => import("/app/pages/data.pdx")');
    });

    it('emits nothing for a route that declares no loader', () => {
        const code = generateOptimizedRouter([PLAIN]);

        expect(code, 'a route with no loader pulled its page module into the router')
            .not.toContain('about.pdx');
        expect(code).toContain('const _loaderModules = {};');
    });
});

describe('how the function is found', () => {
    it('takes it from the registration the page module published', async () => {
        const m = evaluate([DATA]);
        const fn = async () => ({ rows: 2 });
        (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes = [{ path: '/data', loader: fn }];

        expect(await m._resolveLoader({ path: '/data', loader: 'loadRows' })).toBe(fn);
    });

    it('ignores a registration whose loader is not callable', async () => {
        // A loader emitted as a STRING and called anyway is a call on a string. A router that
        // accepts whatever is in that field makes that call one layer down.
        const m = evaluate([PLAIN]);
        (globalThis as { __pdx_routes?: unknown[] }).__pdx_routes = [{ path: '/about', loader: 'loadRows' }];

        expect(m._registeredLoader('/about')).toBeNull();
    });

    it('imports the page module when nothing has registered yet — the lazy first visit', async () => {
        // The path the parity row cannot take: there, the page module is already published. Here
        // the import is real and its specifier does not resolve inside `new Function`, so it
        // REJECTS — which is the observable proof that the fallback ran rather than being skipped.
        const m = evaluate([DATA]);

        await expect(m._resolveLoader({ path: '/data', loader: 'loadRows' })).rejects.toThrow();
    });

    it('returns null rather than importing when the route declares no loader', async () => {
        const m = evaluate([PLAIN]);

        expect(await m._resolveLoader({ path: '/about' })).toBeNull();
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
        const [r] = scan("<script setup>\n@page '/data';\n@loader loadRows;\nasync function loadRows() { return 1; }\n</script>");

        expect(r.loader).toBe('loadRows');
    });

    it('leaves it undefined on a page that declares none', () => {
        // The control: a scanner that returned a name unconditionally would satisfy the case above.
        const [r] = scan("<script setup>\n@page '/about';\n</script>");

        expect(r.loader).toBeUndefined();
    });

    it('does not read the word out of a sentence in a comment', () => {
        const [r] = scan("<script setup>\n@page '/about';\n// the @loader loadRows story is told elsewhere\n</script>");

        expect(r.loader).toBeUndefined();
    });
});
