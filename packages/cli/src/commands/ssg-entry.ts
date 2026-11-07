// The server's side of `pdx build --ssg` (#160, part 5c): a module Vite builds for Node, with the app
// compiled for the server, run by the CLI in a process of its own (`ssg-run.mjs`) — the server DOM is
// global, and the components register in its one registry, so a second build in the same process
// would find every tag taken.
//
// The order of the entry's imports is the one thing it must get right. The server DOM is installed by
// the FIRST import, a module that brings nothing of core: `PdxElement` extends the `HTMLElement` it
// finds when its module is evaluated, and an ES module's imports are evaluated in the order they are
// written. Only then come core, the router and, in `renderAll`, the app's own entry scripts — the
// ones its `index.html` loads — and every lazy page.

import type { Plugin } from 'vite';

export const SSG_ENTRY_ID = 'virtual:pdx-ssg-entry';
const SSG_DOM_ID = 'virtual:pdx-ssg-dom';
const RESOLVED_ENTRY = '\0' + SSG_ENTRY_ID;
const RESOLVED_DOM = '\0' + SSG_DOM_ID;

/** What `renderAll` hands back, as JSON. */
export interface SsgRender {
    /** Set when the app's modules could not run on the server: the message and the first frames. */
    readonly error?: string;
    readonly pages: { readonly path: string; readonly html: string; readonly skipped: { tag: string; reason: string; global?: string }[] }[];
    readonly skippedRoutes: { readonly path: string; readonly reason: string }[];
}

/**
 * The entry's source. `renderAll(markup, extraPaths)` renders `markup` — the built page's body — for
 * every route without parameters and every path in `extraPaths`, and says what it did not render.
 */
export function ssgEntryModule(appEntries: readonly string[]): string {
    const imports = appEntries.map((src) => `        await import(${JSON.stringify(src)});`).join('\n');
    return `import ${JSON.stringify(SSG_DOM_ID)};
import { html } from '@pdxui/core';
import { renderToStringWithReport } from '@pdxui/core/server';
import { serverRoute, serverRoutes, loadServerPages } from '@pdxui/router/server';

const SKIPPED = {
    'not-found': 'no route matches it',
    guard: 'its route is guarded: what it shows depends on the visitor',
    redirect: 'its route redirects',
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

export async function renderAll(markup, extraPaths) {
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
    for (const path of paths) {
        const route = serverRoute(path);
        if (route.skipped) {
            skippedRoutes.push({ path, reason: SKIPPED[route.skipped] });
            continue;
        }
        const { html: rendered, skipped } = renderToStringWithReport(() => html(strings));
        pages.push({ path, html: rendered, skipped: skipped.map((s) => (s.global ? { tag: s.tag, reason: s.reason, global: s.global } : { tag: s.tag, reason: s.reason })) });
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
const { markup, extraPaths } = JSON.parse(readFileSync(input, 'utf-8'));
const { renderAll } = await import(pathToFileURL(entry).href);
writeFileSync(output, JSON.stringify(await renderAll(markup, extraPaths)));
`;

/** The plugin that answers for the entry and for the module that installs the server DOM. */
export function ssgEntryPlugin(appEntries: readonly string[]): Plugin {
    return {
        name: 'pragmatic-pdx-ssg-entry',
        resolveId(id: string) {
            if (id === SSG_ENTRY_ID) return RESOLVED_ENTRY;
            if (id === SSG_DOM_ID) return RESOLVED_DOM;
            return undefined;
        },
        load(id: string) {
            if (id === RESOLVED_ENTRY) return ssgEntryModule(appEntries);
            if (id === RESOLVED_DOM) return `import { installServerDom } from '@pdxui/core/server-dom';\ninstallServerDom();\n`;
            return undefined;
        },
    };
}

// Match: a module script with a src, in an index.html. Groups: [1]=the src.
const MODULE_SCRIPT = /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

/**
 * The module scripts an `index.html` loads, from the root (`./src/main.js` → `/src/main.js`: the
 * entry that imports them is a virtual module, with no folder of its own to be relative to), minus
 * the ones the plugin adds and any on another origin.
 */
export function appEntries(indexHtml: string): string[] {
    return [...indexHtml.matchAll(MODULE_SCRIPT)]
        .map((m) => m[1])
        .filter((src) => !src.startsWith('/@') && !/^[a-z]+:|^\/\//i.test(src))
        .map((src) => (src.startsWith('/') ? src : `/${src.replace(/^\.\//, '')}`));
}
