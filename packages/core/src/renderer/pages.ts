// pages() — Keep-alive page switching for routing patterns.
// Unlike @if (which destroys/recreates DOM), pages() hides inactive pages
// with display:none, preserving component state across navigation.
//
// Usage in template:
//   ${pages(() => currentPage(), {
//     dashboard: () => html`<pdx-dashboard />`,
//     settings: () => html`<pdx-settings />`,
//     profile:  () => html`<pdx-profile />`,
//   })}

import { effect } from '../reactivity/signal';

/**
 * Render one page at a time, caching previous pages (keep-alive).
 * Pages are created lazily on first visit and hidden (not destroyed) when inactive.
 *
 * @param activePage - Reactive function returning the current page key.
 * @param pageMap - Map of page key → render function.
 * @returns DocumentFragment with all cached pages (only active one is visible).
 */
export function pages<K extends string>(
    activePage: () => K,
    pageMap: Record<K, () => Node | DocumentFragment>,
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.style.display = 'contents'; // transparent wrapper
    frag.appendChild(container);

    const cache = new Map<string, HTMLElement>();

    effect(() => {
        const key = activePage();

        // Hide all cached pages
        for (const [, el] of cache) {
            el.style.display = 'none';
        }

        // Create or show the active page
        let pageEl = cache.get(key);
        if (!pageEl) {
            const renderFn = pageMap[key];
            if (!renderFn) return;

            pageEl = document.createElement('div');
            pageEl.dataset.page = key;
            pageEl.style.display = 'contents';

            const content = renderFn();
            if (content instanceof DocumentFragment) {
                pageEl.appendChild(content);
            } else {
                pageEl.appendChild(content);
            }

            cache.set(key, pageEl);
            container.appendChild(pageEl);
        } else {
            pageEl.style.display = 'contents';
        }
    });

    return frag;
}
