// The route a generated page already holds (#160, part 5a): what the outlet keeps at boot instead of
// building it again — `@pdxui/router/hydrate`, installed where the app hydrates, beside core's
// `installHydration()`. An app that is not generated never imports it.
//
// The server wrote the tree the browser's outlet builds (`server.ts`): each layout a child of the
// previous layout's host — the outlet for the first — with its own host somewhere inside it, where
// its render projected it, and the page a child of the last host, its params as attributes. The
// outlet's mark names the route. Found whole, the outlet takes it over and every component in it
// hydrates; a mark for another route, or a tree that is not whole, and what the server wrote is
// removed, so the outlet builds the route as on any other page. The mark is read once, at the first
// resolution.
//
// A lazy page whose module has not arrived stays as the server wrote it, with no placeholder: its
// module is loaded now, and the element upgrades and hydrates where it stands.

import { pageModule } from './active';
import { adoption, type ServerLayout, type ServerTree, type TakeServerTree } from './adoption';
import { loadPage } from './page-load';
import { seedFromPage } from './ssg-data';

/**
 * Have every outlet keep the route a generated page holds, instead of building it again; and keep the
 * loader results the page carries as its levels' results (#239), so the first navigation renders the
 * data the server rendered instead of asking for it.
 */
export function installRouteAdoption(): void {
    adoption.take = takeServerTree;
    seedFromPage();
}

const takeServerTree: TakeServerTree = (outlet, route, config, depth) => {
    const marked = outlet.getAttribute('data-pdx-ssg');
    if (marked === null) return null;
    outlet.removeAttribute('data-pdx-ssg');
    const tree = route && config && marked === route.config.path
        ? serverTree(outlet, depth === 0 ? (config.layouts ?? []) : [], config.tag, route.params)
        : null;
    if (!tree || !route || !config) {
        outlet.replaceChildren();
        return null;
    }
    const page = tree.page;
    // Set once the element is the page's class: an upgrade would reset it to the class's default.
    if (config.keepAlive !== undefined && config.keepAlive !== false) {
        void customElements.whenDefined(config.tag).then(() => { page._keepAlive = true; });
    }
    const tableLoad = pageModule(route.config.path);
    if (config.lazy && (tableLoad || config.file) && !customElements.get(config.tag)) {
        loadPage(route, config, tableLoad).catch((err: Error) => {
            // The page the server wrote stays readable; what it would do does not arrive.
            console.error(`[pdx-router] Lazy load failed for ${route.config.path}:`, err);
        });
    }
    return tree;
};

/** The layouts and the page `tag` with `params`, as the server wrote them inside `outlet`; or null. */
function serverTree(
    outlet: HTMLElement,
    layouts: readonly string[],
    tag: string,
    params: Readonly<Record<string, string>>,
): ServerTree | null {
    const found: ServerLayout[] = [];
    let container: HTMLElement = outlet;
    for (const layout of layouts) {
        const element = childByTag(container, layout);
        const host = element ? hostOf(element, layout) : null;
        if (!element || !host) return null;
        found.push({ tag: layout, element, host });
        container = host;
    }
    const page = childByTag(container, tag);
    if (!page) return null;
    for (const [name, value] of Object.entries(params)) {
        if (page.getAttribute(name) !== value) return null;
    }
    return { layouts: found, page };
}

function childByTag(parent: HTMLElement, tag: string): HTMLElement | null {
    for (const child of parent.children) {
        if (child.localName === tag && child instanceof HTMLElement) return child;
    }
    return null;
}

/** The layout's own host: the first in tree order, since a host of a layout inside it comes after. */
function hostOf(layout: HTMLElement, tag: string): HTMLElement | null {
    for (const el of layout.querySelectorAll('[data-pdx-layout-host]')) {
        if (el.getAttribute('data-pdx-layout-host') === tag && el instanceof HTMLElement) return el;
    }
    return null;
}
