// What the HTML names before the browser asks for it.
//
// Without a preload, a cold `/` fetches its JavaScript in three waves: the entry, then — once the
// browser has run it and learnt what else is needed — the route's own chunk, then the components that
// chunk imports. The gaps between them are 24 of 80 ms on localhost, where a round-trip is free.
//
// Vite emits `modulepreload` for what it can SEE statically, and a route is a dynamic import the
// generated router resolves, so on its own Vite puts none in `dist/index.html`. The compiler can see it: the
// route table is built here, which is the premise of the generated router.
//
// This file measures the choice — which chunks, and which deliberately not. The effect on the
// browser is `packages/showcase/tests/first-paint-waves.spec.ts`, which counts the waves.
import { describe, it, expect } from 'vitest';
import { routePreloadFiles, preloadTags, type BundleChunk, type ScannedRoute } from '../src/plugin-utils';

const route = (path: string, file: string): ScannedRoute => ({ path, file, tag: `pdx-${path.slice(1) || 'home'}` });

const ROUTES = [
    route('/', 'C:/app/src/pages/dashboard.pdx'),
    route('/tickets', 'C:/app/src/pages/tickets.pdx'),
];

/** A bundle shaped the way Rollup shapes one: an entry, a chunk per route, shared components. */
const BUNDLE: Record<string, BundleChunk> = {
    'assets/index-AAA.js': {
        type: 'chunk', fileName: 'assets/index-AAA.js', isEntry: true,
        facadeModuleId: 'C:/app/index.html', imports: [],
    } as BundleChunk,
    'assets/dashboard-BBB.js': {
        type: 'chunk', fileName: 'assets/dashboard-BBB.js',
        facadeModuleId: 'C:\\app\\src\\pages\\dashboard.pdx',
        imports: ['assets/pdx-icon-CCC.js', 'assets/index-AAA.js'],
        viteMetadata: { importedCss: new Set(['assets/dashboard-HHH.css']) },
    },
    'assets/tickets-DDD.js': {
        type: 'chunk', fileName: 'assets/tickets-DDD.js',
        facadeModuleId: 'C:/app/src/pages/tickets.pdx',
        imports: ['assets/pdx-grid-EEE.js'],
        viteMetadata: { importedCss: new Set(['assets/tickets-JJJ.css']) },
    },
    'assets/pdx-icon-CCC.js': {
        type: 'chunk', fileName: 'assets/pdx-icon-CCC.js', imports: [],
        viteMetadata: { importedCss: new Set(['assets/pdx-icon-III.css']) },
    },
    'assets/pdx-grid-EEE.js': { type: 'chunk', fileName: 'assets/pdx-grid-EEE.js', imports: [] },
    'assets/index-FFF.css': { type: 'asset', fileName: 'assets/index-FFF.css' },
};

describe('the chunks a landing route needs', () => {
    it('names the route\'s own chunk', () => {
        expect(routePreloadFiles(BUNDLE, ROUTES, ['/'])).toContain('assets/dashboard-BBB.js');
    });

    it('and what that chunk imports statically, which is the wave after it', () => {
        expect(routePreloadFiles(BUNDLE, ROUTES, ['/'])).toContain('assets/pdx-icon-CCC.js');
    });

    it('matches a path that Windows wrote with backslashes', () => {
        // The scan normalises what it stores; Rollup does not normalise `facadeModuleId`. Compared
        // raw, this found nothing on Windows and the whole feature was a no-op there.
        expect(routePreloadFiles(BUNDLE, ROUTES, ['/']).length).toBeGreaterThan(1);
    });

    it('never names the entry, which the page already loads', () => {
        // `dashboard` imports it: a `<link rel=modulepreload>` for the file the `<script>` tag is
        // already fetching is noise at best.
        expect(routePreloadFiles(BUNDLE, ROUTES, ['/'])).not.toContain('assets/index-AAA.js');
    });

    it('control — it names nothing of the routes that were not asked for', () => {
        // The barrel defect one layer up: preload everything and the first screen pays for the
        // whole application, which is what the code splitting was for.
        const files = routePreloadFiles(BUNDLE, ROUTES, ['/']);
        expect(files).not.toContain('assets/tickets-DDD.js');
        expect(files).not.toContain('assets/pdx-grid-EEE.js');
    });

    it('control — an empty list of routes preloads nothing', () => {
        expect(routePreloadFiles(BUNDLE, ROUTES, [])).toEqual([]);
    });

    it('control — a route with no chunk of its own is skipped, not guessed at', () => {
        expect(routePreloadFiles(BUNDLE, ROUTES, ['/nowhere'])).toEqual([]);
    });

    it('finds a route whose chunk Rollup merged into a larger one', () => {
        const merged: Record<string, BundleChunk> = {
            'assets/pages-GGG.js': {
                type: 'chunk', fileName: 'assets/pages-GGG.js', facadeModuleId: null,
                moduleIds: ['C:/app/src/pages/dashboard.pdx', 'C:/app/src/pages/tickets.pdx'],
                imports: [],
            },
        };
        expect(routePreloadFiles(merged, ROUTES, ['/'])).toEqual(['assets/pages-GGG.js']);
    });
});

describe('the tags', () => {
    it('carry crossorigin, because the script tags do', () => {
        // A preload whose CORS mode does not match the request it is meant to serve is fetched
        // TWICE — the saved round-trip turns into an extra download.
        expect(preloadTags(['assets/a.js'], '/'))
            .toBe('<link rel="modulepreload" crossorigin href="/assets/a.js">');
    });

    it('respect a base path', () => {
        expect(preloadTags(['assets/a.js'], '/app/')).toContain('href="/app/assets/a.js"');
        expect(preloadTags(['assets/a.js'], '/app')).toContain('href="/app/assets/a.js"');
    });

    it('control — no files, no tags', () => {
        expect(preloadTags([], '/')).toBe('');
    });

    it('a stylesheet is preloaded as a style, with the crossorigin Vite\'s loader uses', () => {
        // Vite's dynamic-import helper inserts the chunk's CSS as `<link rel=stylesheet crossorigin>`
        // and waits for it to load before the import resolves. A preload in the same CORS mode is the
        // download that link then finds in the cache; `as="style"` keeps it from blocking the splash's
        // paint, which a `rel=stylesheet` here would.
        expect(preloadTags(['assets/a.css'], '/'))
            .toBe('<link rel="preload" as="style" crossorigin href="/assets/a.css">');
    });
});

describe('the stylesheets a landing route needs', () => {
    // The route's chunk is imported through Vite's preload helper, which waits for the chunk's CSS
    // before the import resolves — so the page cannot mount until its stylesheets are in. Named in
    // the HTML they start with the entry; otherwise they start after it has run, one round trip
    // later, and the first page waits for them.

    it('names the CSS of the route\'s chunk and of the chunks it imports statically', () => {
        const files = routePreloadFiles(BUNDLE, ROUTES, ['/']);
        expect(files).toContain('assets/dashboard-HHH.css');
        expect(files).toContain('assets/pdx-icon-III.css');
    });

    it('control — not the CSS of a route that was not asked for', () => {
        expect(routePreloadFiles(BUNDLE, ROUTES, ['/'])).not.toContain('assets/tickets-JJJ.css');
    });

    it('control — not the entry\'s stylesheet, which the page already links', () => {
        expect(routePreloadFiles(BUNDLE, ROUTES, ['/'])).not.toContain('assets/index-FFF.css');
    });
});
