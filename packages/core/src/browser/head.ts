// Head Management — Reactive document meta and link tags.
// Used by @meta rune. For reactive title, use useTitle from ./title.ts.

import type { Dispose } from '../utils/types';

export interface MetaTag {
    name?: string;
    property?: string;
    content: string;
}

export interface LinkTag {
    rel: string;
    href: string;
    type?: string;
    crossorigin?: string;
}

export interface HeadConfig {
    title?: string;
    meta?: MetaTag[];
    link?: LinkTag[];
}

/**
 * Set document head tags (title, meta, link).
 * Returns a dispose function that removes the created tags.
 *
 * For reactive titles, use useTitle() from browser/title.ts instead.
 */
export function useHead(config: HeadConfig): Dispose {
    const createdElements: Element[] = [];

    // Title — static set with restore on dispose
    if (config.title !== undefined) {
        const previousTitle = document.title;
        document.title = config.title;
        // Fake element whose remove() restores the previous title
        createdElements.push(Object.assign(document.createElement('_'), {
            remove: () => { document.title = previousTitle; },
        }) as unknown as Element);
    }

    // Meta tags
    if (config.meta) {
        for (const meta of config.meta) {
            const el = document.createElement('meta');
            if (meta.name) el.setAttribute('name', meta.name);
            if (meta.property) el.setAttribute('property', meta.property);
            el.setAttribute('content', meta.content);
            document.head.appendChild(el);
            createdElements.push(el);
        }
    }

    // Link tags
    if (config.link) {
        for (const link of config.link) {
            const el = document.createElement('link');
            el.setAttribute('rel', link.rel);
            el.setAttribute('href', link.href);
            if (link.type) el.setAttribute('type', link.type);
            if (link.crossorigin) el.setAttribute('crossorigin', link.crossorigin);
            document.head.appendChild(el);
            createdElements.push(el);
        }
    }

    return () => {
        for (const el of createdElements) {
            el.remove();
        }
        createdElements.length = 0;
    };
}
