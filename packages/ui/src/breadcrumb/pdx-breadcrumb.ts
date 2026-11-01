// pdx-breadcrumb — Breadcrumb navigation with overflow collapse and custom separators.
// Slot: "item" — custom breadcrumb item template (priority: slot > default)
//
// Usage:
//   <pdx-breadcrumb :items="${crumbs}">
//     <slot name="item" let:item let:index let:isLast>
//       <a :href="${item.href}">${item.label}</a>
//     </slot>
//   </pdx-breadcrumb>

import { component, html, sanitizeUrl, routeTrail, slot, snippetOrSlot, event } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
/** `pdx-icon` the first time a crumb names an icon: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

export interface BreadcrumbItem {
    key: string;
    label: string;
    href?: string;
    icon?: string;
}

/**
 * Navigation breadcrumbs, with overflow collapse and custom separators.
 *
 * @slot item - Renders one crumb: a snippet `item(item, index, isLast)`, or the scoped slot, which receives `{ item, index, isFirst, isLast }`.
 *
 * @csspart nav - The `<nav>` that names the trail (`.pdx-breadcrumb`).
 * @csspart list - The `<ol>` of the crumbs.
 * @csspart item - One crumb, an `<li>`; the last is `aria-current="page"` when a snippet draws it.
 * @csspart link - A crumb that leads somewhere: a link with an `href`, a button without one.
 * @csspart current - The page you are on, the last crumb, `aria-current="page"`.
 * @csspart separator - The glyph between two crumbs, hidden from assistive technology.
 * @csspart ellipsis - The button that stands for the crumbs `max-items` collapsed.
 */
component('pdx-breadcrumb', {
    // It holds no position of its own (#289): the page you are on is its last crumb, so it has no
    // model and no state.
    events: {
        /** A crumb was chosen: its `key` and the item. */
        'pdx-select': event<{ key: string; item: T }>(),
    },
    parts: ['nav', 'list', 'item', 'link', 'current', 'separator', 'ellipsis'],
    props: {
        items: { type: Array, default: [] },
        // Empty = use the theme's --pdx-breadcrumb-separator (filled via CSS on the
        // empty .pdx-breadcrumb-sep). A non-empty prop is an explicit override.
        separator: { type: String, default: '' },
        maxItems: { type: Number, default: 0 },
    },
    // A parent's `@snippet` sets these, positional arguments; the alpha scoped slot stays (#595).
    // The crumb a snippet receives is the app's, an element of `items` (#651): the editor infers `T`.
    generics: { T: { extends: '{ key: string; label: string }', from: 'items' } },
    slots: {
        item: slot<(item: T, index: number, isLast: boolean) => Node>(),
    },
    setup(ctx) {
        let built = false;

        function getItemSlot(): SlotFunction | undefined {
            return snippetOrSlot(ctx, 'item', (s) => [s.item, s.index, s.isLast]);
        }

        /**
         * The crumbs to render: `items` when the app passed any, otherwise the trail the router
         * published.
         *
         * `items` stays authoritative. Given nothing, an empty nav would make every page restate by
         * hand a path the router already holds — and the copy goes stale the day a route is renamed.
         *
         * The trail comes from core's registry, which `@pdxui/router` fills on every
         * navigation. Reading it here rather than importing the router keeps this package's
         * dependency on core alone.
         */
        function crumbs(): BreadcrumbItem[] {
            const given = ctx.items() as BreadcrumbItem[];
            if (given.length > 0) return given;
            return routeTrail().map((c, i) => ({
                key: `${i}:${c.href}`,
                label: c.label,
                // The page you are on is not a link — the component already renders the last crumb
                // as a span with aria-current, and an href on it would undo that.
                href: c.current ? undefined : c.href,
            }));
        }

        ctx.track(() => {
            const items = crumbs();
            const separator = ctx.separator() as string;
            const maxItems = ctx.maxItems() as number;

            if (!built) {
                built = true;
                requestAnimationFrame(() => buildBreadcrumb(items, separator, maxItems));
                return;
            }

            requestAnimationFrame(() => buildBreadcrumb(items, separator, maxItems));
        });

        function buildBreadcrumb(items: BreadcrumbItem[], separator: string, maxItems: number): void {
            const nav = ctx.el.querySelector('nav') || document.createElement('nav');
            nav.className = 'pdx-breadcrumb';
            nav.setAttribute('data-part', 'nav');
            uiAttr(nav, 'aria-label', () => uiString('breadcrumb', 'label'));
            nav.innerHTML = '';

            let visibleItems = items;

            if (maxItems > 0 && items.length > maxItems) {
                const first = items.slice(0, 1);
                const last = items.slice(-(maxItems - 1));
                visibleItems = [...first, { key: '__ellipsis', label: '...' }, ...last];
            }

            const ol = document.createElement('ol');
            ol.className = 'pdx-breadcrumb-list';
            ol.setAttribute('data-part', 'list');
            ol.setAttribute('role', 'list');

            visibleItems.forEach((item, i) => {
                const li = document.createElement('li');
                li.className = 'pdx-breadcrumb-item';
                li.setAttribute('data-part', 'item');
                const isLast = i === visibleItems.length - 1;
                const isFirst = i === 0;
                const isEllipsis = item.key === '__ellipsis';

                if (isEllipsis) {
                    // A button: a <span> with a click handler, named "\u2026", has no focus and no key.
                    // Expanding rebuilds the path, so focus goes to the first crumb it
                    // revealed rather than to <body>.
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'pdx-breadcrumb-ellipsis';
                    btn.setAttribute('data-part', 'ellipsis');
                    btn.textContent = '\u2026';
                    uiAttr(btn, 'aria-label', () => uiString('breadcrumb', 'expand'));
                    btn.addEventListener('click', () => {
                        buildBreadcrumb(items, separator, 0);
                        const revealed = nav.querySelectorAll<HTMLElement>('.pdx-breadcrumb-item')[1];
                        revealed?.querySelector<HTMLElement>('a, button, [tabindex]')?.focus();
                    });
                    li.appendChild(btn);
                } else if (getItemSlot()) {
                    // Use slot template for all non-ellipsis items
                    const content = getItemSlot()!({ item, index: i, isFirst, isLast });
                    if (content instanceof DocumentFragment) {
                        li.appendChild(content);
                    } else {
                        li.appendChild(content);
                    }
                    if (isLast) li.setAttribute('aria-current', 'page');
                } else if (isLast) {
                    const span = document.createElement('span');
                    span.className = 'pdx-breadcrumb-current';
                    span.setAttribute('data-part', 'current');
                    span.setAttribute('aria-current', 'page');
                    if (item.icon) {
                        loadIcon();
                        const icon = document.createElement('pdx-icon');
                        icon.setAttribute('name', item.icon);
                        icon.setAttribute('size', '14');
                        span.appendChild(icon);
                    }
                    span.appendChild(document.createTextNode(item.label));
                    li.appendChild(span);
                } else {
                    // ⚠️ An <a> without an href is not focusable and is not announced as a link, and
                    // this crumb always has a click handler that emits pdx-select. So an item with no
                    // href — the event-driven route the skill recommends — is a button, or it would be a
                    // control nobody could reach from the keyboard. With one, it stays a real link: middle-click, open in
                    // a new tab, copy the address all keep working.
                    const safeHref = sanitizeUrl(item.href);
                    const a = document.createElement(safeHref ? 'a' : 'button');
                    a.className = 'pdx-breadcrumb-link';
                    a.setAttribute('data-part', 'link');
                    if (safeHref) (a as HTMLAnchorElement).href = safeHref;
                    else (a as HTMLButtonElement).type = 'button';
                    if (item.icon) {
                        loadIcon();
                        const icon = document.createElement('pdx-icon');
                        icon.setAttribute('name', item.icon);
                        icon.setAttribute('size', '14');
                        a.appendChild(icon);
                    }
                    a.appendChild(document.createTextNode(item.label));
                    a.addEventListener('click', (e) => {
                        if (!item.href) e.preventDefault();
                        ctx.emit('pdx-select', { key: item.key, item });
                    });
                    li.appendChild(a);
                }

                // Separator (not after last)
                if (!isLast) {
                    const sep = document.createElement('span');
                    sep.className = 'pdx-breadcrumb-sep';
                    sep.setAttribute('data-part', 'separator');
                    sep.setAttribute('aria-hidden', 'true');
                    // Leave empty when no explicit prop → CSS fills the glyph from the theme token.
                    if (separator) sep.textContent = separator;
                    li.appendChild(sep);
                }

                ol.appendChild(li);
            });

            nav.appendChild(ol);
            if (!ctx.el.contains(nav)) ctx.el.appendChild(nav);
        }

        return {};
    },
    render: () => html``,
});

/** The crumb a snippet receives, the app's (#651): the editor infers it from `:items`. */
type T = { key: string; label: string };
