// The server's side of `pdx build --ssg` (#160, part 5c): a module Vite builds for Node, with the app
// compiled for the server, run by the CLI in a process of its own (`ssg-run.mjs`) — the server DOM is
// global, and the components register in its one registry, so a second build in the same process
// would find every tag taken.
//
// The order of the entry's imports is the one thing it must get right. The server DOM is installed by
// the FIRST import, a module that brings nothing of core: `PdxElement` extends the `HTMLElement` it
// finds when its module is evaluated, and an ES module's imports are evaluated in the order they are
// written. Only then come core, the router and, in `renderAll`, the module `ssg.setup` names, the app's
// own entry scripts — the ones its `index.html` loads — and every lazy page.

import type { Plugin } from 'vite';
import { join } from 'pathe';

export const SSG_ENTRY_ID = 'virtual:pdx-ssg-entry';
const SSG_DOM_ID = 'virtual:pdx-ssg-dom';
const RESOLVED_ENTRY = '\0' + SSG_ENTRY_ID;
const RESOLVED_DOM = '\0' + SSG_DOM_ID;

/** A page's head as the server collected it (core's `ServerHead`). */
export interface PageHead {
    readonly title: string | null;
    readonly meta: readonly { name?: string; property?: string; content: string }[];
    readonly link: readonly { rel: string; href: string; type?: string; crossorigin?: string }[];
}

/** What `renderAll` hands back, as JSON. */
export interface SsgRender {
    /** Set when the app's modules could not run on the server: the message and the first frames. */
    readonly error?: string;
    /** Set when preparing a path failed, a loader that threw (#239): the path, and the error. */
    readonly failed?: { readonly path: string; readonly message: string };
    readonly pages: {
        readonly path: string;
        /** The pattern of the route the path matched. */
        readonly route: string;
        readonly html: string;
        readonly skipped: { tag: string; reason: string; global?: string; at?: string }[];
        /** The head the route's components set: `@title`, `@meta`, `useHead`. */
        readonly head: PageHead;
    }[];
    readonly skippedRoutes: { readonly path: string; readonly reason: string }[];
}

/**
 * The entry's source. `renderAll(markup, extraPaths)` renders `markup` — the built page's body — for
 * every route without parameters and every path in `extraPaths`, and says what it did not render.
 * `setup`, the module `ssg.setup` names, is imported before the app's entries.
 */
export function ssgEntryModule(appEntries: readonly string[], setup: string | null): string {
    // An inline script is imported as the module the plugin serves for it (`inlineEntryId`).
    const imports = [...(setup ? [setup] : []), ...appEntries]
        .map((src) => `        await import(${JSON.stringify(src)});`).join('\n');
    return `import ${JSON.stringify(SSG_DOM_ID)};
import { html } from '@pdxui/core';
import { renderToStringWithReport } from '@pdxui/core/server';
import { serverRoute, serverRoutes, loadServerPages, ssgDataScript } from '@pdxui/router/server';

const SKIPPED = {
    'not-found': 'no route matches it',
    refused: 'an onBeforeNavigate hook refused it',
    guard: 'its guard is denied: the build has set no permission that grants it',
    redirect: 'its route redirects',
    'loader-redirect': 'its loader redirected with redirect()',
    'loader-not-found': 'its loader said notFound()',
};

/** A pattern a build can write as it is: no :param, no wildcard. */
const isStatic = (pattern) => !/[:*]/.test(pattern);

/** Whether a path has the shape of a pattern: as many segments, the literal ones equal. */
function hasShape(pattern, path) {
    const a = pattern.split('/').filter(Boolean);
    const b = path.split('/').filter(Boolean);
    if (a.some((s) => s.startsWith('*'))) return b.length >= a.length - 1;
    return a.length === b.length && a.every((s, i) => s.startsWith(':') || s === b[i]);
}

/** The error's message and the first frames of its stack: with source maps on, the app's files. */
function stackHead(e) {
    if (!(e instanceof Error)) return String(e);
    const frames = (e.stack ?? '').split('\\n').slice(1, 4).map((l) => l.trim()).join('\\n    ');
    return e.message + '\\n    ' + frames;
}

/**
 * A fetch of a path — \`/api/tickets/1\`, what a loader writes for the app's own server — resolved
 * against \`origin\` (#239): in Node there is no page a relative URL is relative to.
 */
function resolveFetchAgainst(origin) {
    const fetchOf = globalThis.fetch;
    const relative = (url) => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
    globalThis.fetch = (input, init) => fetchOf(relative(input) ? new URL(input, origin) : input, init);
}

export async function renderAll(markup, extraPaths, origin) {
    if (origin) resolveFetchAgainst(origin);
    try {
${imports}
        await loadServerPages();
    } catch (e) {
        return { error: stackHead(e), pages: [], skippedRoutes: [] };
    }
    const strings = Object.assign([markup], { raw: [markup] });
    const pages = [];
    const skippedRoutes = [];
    const paths = [];
    for (const pattern of serverRoutes()) {
        if (isStatic(pattern)) paths.push(pattern);
        else if (!extraPaths.some((p) => hasShape(pattern, p))) {
            skippedRoutes.push({ path: pattern, reason: 'it has parameters, and ssg.routes names no path for it' });
        }
    }
    for (const p of extraPaths) if (!paths.includes(p)) paths.push(p);
    // When the loaders' results were fetched: one time for the build, from which their staleTime counts.
    const builtAt = Date.now();
    for (const path of paths) {
        let route;
        try {
            route = await serverRoute(path);
        } catch (e) {
            // A loader that failed (#239): the build stops, naming the path it was generating.
            return { failed: { path, message: stackHead(e) }, pages: [], skippedRoutes: [] };
        }
        if (route.skipped) {
            skippedRoutes.push({ path, reason: SKIPPED[route.skipped] });
            continue;
        }
        const { html: rendered, skipped, head } = renderToStringWithReport(() => html(strings));
        // The loaders' results, after the markup they rendered: the client keeps them at boot (#239).
        const data = route.data && route.data.length > 0 ? ssgDataScript(route.data, builtAt) : '';
        pages.push({ path, route: route.route, html: rendered + data, head, skipped: skipped.map((s) => ({ tag: s.tag, reason: s.reason, ...(s.global ? { global: s.global } : {}), ...(s.at ? { at: s.at } : {}) })) });
    }
    return { pages, skippedRoutes };
}
`;
}

/**
 * The script the CLI runs with node: it imports the built entry, renders, and writes the result as
 * JSON to a file — not to stdout, which the app's own logging may also write to.
 */
export const SSG_RUNNER = `import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [entry, input, output] = process.argv.slice(2);
const { markup, extraPaths, origin } = JSON.parse(readFileSync(input, 'utf-8'));
// An entry script that starts work it does not await (void setupI18n()) fails after it has run:
// reported as an import that failed, with its file and line, not as a crash of this process.
const failed = (e) => {
    const frames = e instanceof Error ? (e.stack ?? '').split('\\n').slice(1, 4).map((l) => l.trim()).join('\\n    ') : '';
    writeFileSync(output, JSON.stringify({ error: (e instanceof Error ? e.message : String(e)) + '\\n    ' + frames, pages: [], skippedRoutes: [] }));
    process.exit(0);
};
process.on('unhandledRejection', failed);
process.on('uncaughtException', failed);
const { renderAll } = await import(pathToFileURL(entry).href);
writeFileSync(output, JSON.stringify(await renderAll(markup, extraPaths, origin)));
// Done once the result is written: the CLI waits for this process to exit, and the app's modules may
// keep it alive — an interval, a socket a fetch kept open — which is theirs to keep (#239: a build of
// a route with a loader did not exit, with no handle Node lists). Exited in the next macrotask, not
// this one: Node reports an unhandled rejection once the microtasks have drained, before the
// setImmediate phase, so work an entry started and did not await still fails the build above.
setImmediate(() => process.exit(0));
`;

/** The plugin that answers for the entry and for the module that installs the server DOM. */
export function ssgEntryPlugin(entries: readonly AppEntry[], root: string, setup: string | null): Plugin {
    // An inline script's module is at a path of the root — one no file has — so that its relative
    // imports (`./src/app.pdx`) resolve as they do from the index.html it was written in.
    const inline = entries.flatMap((e) => ('inline' in e ? [e.inline] : []));
    const inlinePath = (i: number): string => join(root, `__pdx-ssg-inline-${i}.js`);
    // In the page's order: an inline script after a loaded one runs after it, here as there.
    let n = 0;
    const ids = entries.map((e) => ('src' in e ? e.src : inlineEntryId(n++)));
    return {
        name: 'pragmatic-pdx-ssg-entry',
        resolveId(id: string) {
            if (id === SSG_ENTRY_ID) return RESOLVED_ENTRY;
            if (id === SSG_DOM_ID) return RESOLVED_DOM;
            const at = inline.findIndex((_, i) => id === inlineEntryId(i));
            if (at !== -1) return inlinePath(at);
            return undefined;
        },
        load(id: string) {
            if (id === RESOLVED_ENTRY) return ssgEntryModule(ids, setup);
            if (id === RESOLVED_DOM) return `import { installServerDom } from '@pdxui/core/server-dom';\ninstallServerDom();\n`;
            const at = inline.findIndex((_, i) => id === inlinePath(i));
            if (at !== -1) return inline[at];
            return undefined;
        },
    };
}

/** The id the entry imports the `i`-th inline module script by. */
function inlineEntryId(i: number): string {
    return `virtual:pdx-ssg-inline-${i}`;
}

// Match: a module script, its attributes and its body. Groups: [1]=the attributes [2]=the body
const MODULE_SCRIPT = /<script\b([^>]*\btype=["']module["'][^>]*)>([\s\S]*?)<\/script\s*>/gi;
// Match: a src attribute. Groups: [1]=its value
const SRC = /\bsrc=["']([^"']+)["']/i;

/**
 * A module script an `index.html` runs: one it loads by `src` — from the root, `./src/main.js` →
 * `/src/main.js` — or one written inline, by its body.
 */
export type AppEntry = { readonly src: string } | { readonly inline: string };

/**
 * The module scripts of an `index.html`, in the order the page runs them, minus the ones the plugin
 * adds and any on another origin.
 */
export function appEntries(indexHtml: string): AppEntry[] {
    const entries: AppEntry[] = [];
    for (const [, attrs, body] of indexHtml.matchAll(MODULE_SCRIPT)) {
        const url = SRC.exec(attrs)?.[1];
        if (url === undefined) {
            if (body.trim()) entries.push({ inline: body });
        } else if (!url.startsWith('/@') && !/^[a-z]+:|^\/\//i.test(url)) {
            entries.push({ src: url.startsWith('/') ? url : `/${url.replace(/^\.\//, '')}` });
        }
    }
    return entries;
}
