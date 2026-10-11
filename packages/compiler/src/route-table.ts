// The route table a project's `@page` declarations compile to — DATA, not a router.
//
// `@pdxui/router` has one router, in TypeScript, and this module is what it reads in a build and
// on the dev server: every route's fields, a lazy `import()` per page with a literal specifier the
// bundler can split on, a bridge to each `@loader`, and the `@redirect` table. The router builds its
// matcher from it once, when it starts (#108). Before, the build emitted a second router here, as a
// string no typechecker read, and a parity table was what kept the two alike.
//
// The two producers differ in ONE thing, how a page's module is named: a build imports the file,
// the dev server asks for the URL it serves. `buildSpecifier` and `devSpecifier`.

import { relative } from 'node:path';
import { jsString } from './compiler/js-literal';
import type { ScannedRoute } from './plugin-utils';

/** How the table names a page's module in an `import()`. */
export type ModuleSpecifier = (file: string) => string;

/** A build imports the file itself; Rollup resolves it and gives the page its chunk. */
export const buildSpecifier: ModuleSpecifier = (file) => file;

/** The dev server imports the page by the URL it serves: root-relative, or `/@fs/` outside the root. */
export function devSpecifier(root: string): ModuleSpecifier {
    return (file) => {
        const rel = relative(root, file).replace(/\\/g, '/');
        return rel.startsWith('..') ? `/@fs/${file.replace(/\\/g, '/')}` : `/${rel}`;
    };
}

/** The table, as a module id. */
export const ROUTE_TABLE_ID = 'virtual:pdx-routes';

/**
 * The router's seam (`@pdxui/router/src/active.ts`) in a production build: its own source, with
 * the table installed before anything it exports can be called. Its surface stays the file's.
 */
export function routerSeamModule(seamSource: string): string {
    return `import * as __pdxRouteTable from ${jsString(ROUTE_TABLE_ID)};\n`
        + `import { installRouteTable as __pdxInstallRouteTable } from './runtime';\n`
        + `__pdxInstallRouteTable(__pdxRouteTable);\n`
        + seamSource;
}

/**
 * What the dev server puts in `index.html`: the same table, handed over as a global. Not through
 * the seam, because an installed `@pdxui/router` may be pre-bundled in dev, and a pre-bundled file
 * never reaches a plugin's `load`.
 */
export function devRouteTableModule(): string {
    return `import * as table from ${jsString(ROUTE_TABLE_ID)};\nglobalThis.__pdx_route_table = table;\n`;
}

/**
 * The route-table module for these routes: `routes`, `pageModules` and `redirects`, the shape
 * `RouteTable` in `@pdxui/router` declares.
 *
 * No early return for a project without routes: the seam imports this module in every build, and an
 * app can legitimately have no `@page` yet.
 */
export function generateRouteTable(routes: ScannedRoute[], specifierOf: ModuleSpecifier = buildSpecifier): string {
    const imp = (file: string) => `() => import(${jsString(specifierOf(file))})`;

    // Field by field, in the order `RouteConfig` and the outlet read them. A field dropped here is
    // absent from every app — `route-field-lockstep.test.ts` compares this list with the page
    // module's own registration and with what the outlet reads.
    const routeEntries = routes.map((r) => '  { '
        + [
            `path: ${jsString(r.path)}`,
            `tag: ${jsString(r.tag)}`,
            r.guard ? `guard: ${jsString(r.guard)}` : '',
            r.redirect ? `redirect: ${jsString(r.redirect)}` : '',
            r.meta ? `meta: ${jsString(r.meta)}` : '',
            r.hasOutlet ? 'hasOutlet: true' : '',
            r.keepAlive !== undefined ? `keepAlive: ${jsString(r.keepAlive)}` : '',
            r.preload ? 'preload: true' : '',
            r.prefetch ? `prefetch: ${jsString(r.prefetch)}` : '',
            r.transition ? `transition: ${jsString(r.transition)}` : '',
            r.scroll ? `scroll: ${jsString(r.scroll)}` : '',
            r.label ? `label: ${jsString(r.label)}` : '',
            r.labelKey ? `labelKey: ${jsString(r.labelKey)}` : '',
            r.outlets && r.outlets.length > 0 ? `outlets: ${jsString(r.outlets)}` : '',
            r.layouts && r.layouts.length > 0 ? `layouts: ${jsString(r.layouts)}` : '',
            // No `file`: the page's `import()` is in `pageModules`, and in a build the specifier is
            // the file's absolute path on the machine that built it.
            r.lazy ? 'lazy: true' : '',
            // The FUNCTION lives in the page's module, which this table must not import statically —
            // that would put every page in the entry. The bridge imports the page and calls the
            // loader its registration published.
            r.loader ? `loader: () => __load(${jsString(r.path)}, ${imp(r.file)}, ${jsString(r.loader)})` : '',
        ].filter(Boolean).join(', ')
        + ' }',
    ).join(',\n');

    // One `import()` with a LITERAL specifier per lazily loaded page, keyed by path. The literal is
    // the whole point: `import(config.file)` with a runtime string is not analysed by Rollup, so
    // every page would stay in the entry chunk. Keyed by path because two routes can share a page.
    const pageModules = routes
        .filter(r => r.lazy && r.file && !r.redirect)
        .map(r => `  ${jsString(r.path)}: ${imp(r.file)}`)
        .join(',\n');

    // `@redirect '/from' -> '/to'` is a table entry a file declares wherever it likes, so the
    // entries are merged across every scanned route.
    const redirectPairs = routes.flatMap(r => r.redirects ?? []);

    return `// Generated by @pdxui/compiler — the route table: ${routes.length} routes, data only.
// @pdxui/router reads it; the matcher is built from it once, when the router starts.

/** The @loader a page module registered for this path, or null until the module is imported. */
function __registered(path) {
  const hit = (globalThis.__pdx_routes ?? []).find(r => r.path === path);
  return hit && typeof hit.loader === 'function' ? hit.loader : null;
}

/** Import the page when its loader has not registered yet, then call it. */
async function __load(path, page, name) {
  let fn = __registered(path);
  if (!fn) { await page(); fn = __registered(path); }
  if (!fn) {
    throw new Error('@loader "' + name + '" is declared on ' + path + ' but the page module '
      + 'registered none. Declare it in <script>: async function ' + name + '() { … }');
  }
  return fn();
}

export const routes = [\n${routeEntries}\n];

export const pageModules = {${pageModules ? `\n${pageModules}\n` : ''}};

export const redirects = ${jsString(redirectPairs)};
`;
}
