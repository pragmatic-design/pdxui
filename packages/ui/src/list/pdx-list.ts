// pdx-list — Data-bound list component drawn by its parent's snippets.
// Priority: the `item` snippet > the default renderer. The `renderItem` callback of alpha is gone
// (#292), and so is the scoped slot (#492): the snippet is the way.
// Uses keyed reconciliation (repeat/LIS) instead of innerHTML rebuild.
//
// Usage:
//   <pdx-list :items="users">
//     @snippet item(item, index) { <div>{{ item.name }}</div> }
//     @snippet empty() { <div>No users found</div> }
//   </pdx-list>

import { component, html, inject, repeatWithSlot, slot, declaredSnippet, prop } from '@pdxui/core';
import { DataSourceContext } from '../data-source/data-source-context';
import type { DataSource, SlotFunction } from '@pdxui/core';
import { uiString } from '../shared/i18n';
import { defineIcons } from '../icon/icon-map';
import iconInbox from '../icon/pragmatic/inbox';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/list';
// The list draws a block-UI overlay while it loads, and the stylesheet that makes it invisible when
// idle belongs to THAT component. Without this the overlay has no rule at all — `display: block`,
// `opacity: 1` — so a page that renders a list and nothing else shows a spinner sitting on it for
// good: a loading ring over the first row, forever.
import '@pdxui/design/components/block-ui';
// `pdx-icon` is imported where the empty state SHOWS, not here: the list's one icon is the empty
// state's, and a list with rows would pay for the whole icon set without ever drawing it — 16.3 KB
// of the showcase's first paint. It stays the list's own import.
// `pdx-spinner` the same way, where the overlay SHOWS (`showBusy`): since it draws from a stylesheet
// of its own (#821), importing it here put that stylesheet in the first wave of every page with a
// list, and the route waited for it — ~70 ms of the showcase's `/` on slow 4G (#963).

export interface ListItem {
    [key: string]: unknown;
}

/**
 * A list bound to data, an array or a DataSource, with custom item templates, a loading overlay
 * and an empty state.
 *
 * @slot item - Renders one item: a snippet `item(item, index)`.
 * @slot empty - Shown when the list has no items: a snippet `empty()`.
 * @csspart list - The `role="list"` container of the items.
 * @csspart item - An item's row, `role="listitem"`. A page of a larger source gives each its `aria-setsize` and `aria-posinset` (A3).
 * @csspart empty - The empty state.
 * @csspart overlay - The loading overlay, drawn while the source loads.
 * @cssstate bordered - `bordered` is set (the default): the list is framed.
 * @cssstate dividers - `dividers` is set: a rule between items.
 * @cssstate loading - Its source is pending: the host is `aria-busy` too (A4).
 * @cssstate empty - It has no items, and is not loading.
 */
component('pdx-list', {
    states: ['bordered', 'dividers', 'loading', 'empty'],
    parts: ['list', 'item', 'empty', 'overlay'],
    props: {
        items: prop<unknown[] | null>(null, { type: Array }),
        source: prop<Record<string, unknown> | null>(null),
        idField: prop('id'),
        dividers: prop(false),
        clickable: prop(false),
        bordered: prop(true),
        /** The empty state's title. Empty: the list.empty component string, «No items». */
        emptyTitle: prop(''),
        emptyDescription: prop(''),
        emptyIcon: prop('inbox', { iconName: true }),
        /**
         * The list's accessible name, `aria-label` on the host, written on the `role="list"` element
         * (#1053): the host has no role, so a name left on it alone names nothing.
         */
        ariaLabel: prop(''),
        /** The id of the element that names the list, `aria-labelledby` on the host, written the same way. */
        ariaLabelledby: prop(''),
    },
    // A parent's `@snippet` sets these, positional arguments; the alpha scoped slot is not read (#492).
    // The item a snippet receives is the app's, an element of `items` (#651) or of `source` (#853):
    // the editor infers `T`.
    generics: { T: { from: 'items', source: 'source' } },
    slots: {
        item: slot<(item: T, index: number) => Node>(),
        empty: slot<() => Node>(),
    },
    setup(ctx) {
        let built = false;
        let listEl: HTMLElement | null = null;
        let emptyEl: HTMLElement | null = null;

        /** Show or hide the empty state; the first time it shows its icon, load `pdx-icon`. */
        function showEmpty(show: boolean): void {
            ctx.state('empty', show);
            if (!emptyEl) return;
            emptyEl.style.display = show ? '' : 'none';
            if (show && emptyEl.querySelector('pdx-icon') && !customElements.get('pdx-icon')) void import('../icon/pdx-icon');
        }
        let blockEl: HTMLElement | null = null;

        /**
         * Draw the loading overlay while the source loads, and say so only then (#299): the overlay's
         * spinner is a «Loading» status, so out of the accessibility tree whenever it is not drawn, and
         * the host is aria-busy while loading — pdx-block-ui's own rules.
         */
        function showBusy(loading: boolean): void {
            ctx.state('loading', loading);
            if (!blockEl) return;
            // Its element is in the overlay already; it upgrades when its module lands.
            if (loading && !customElements.get('pdx-spinner')) void import('../spinner/pdx-spinner');
            blockEl.classList.toggle('pdx-block-ui-visible', loading);
            if (loading) blockEl.removeAttribute('aria-hidden');
            else blockEl.setAttribute('aria-hidden', 'true');
            if (loading) ctx.el.setAttribute('aria-busy', 'true');
            else ctx.el.removeAttribute('aria-busy');
        }
        let repeatFragment: DocumentFragment | null = null;

        /** Name the list from the host's `aria-label` and `aria-labelledby` (#1053). */
        function applyName(): void {
            if (!listEl) return;
            for (const [attr, value] of [['aria-label', ctx.ariaLabel()], ['aria-labelledby', ctx.ariaLabelledby()]] as const) {
                if (value) listEl.setAttribute(attr, value as string);
                else listEl.removeAttribute(attr);
            }
        }
        // The props are read before the list exists, so the name follows them once it does.
        ctx.track(() => {
            void ctx.ariaLabel(); void ctx.ariaLabelledby();
            applyName();
        });

        let injectedDS: DataSource<unknown> | null = null;

        // Read where they draw: a snippet set after mount is the one drawn
        function getItemSlot(): SlotFunction | undefined {
            return declaredSnippet(ctx, 'item', (s) => [s.item, s.index]);
        }
        function getEmptySlot(): SlotFunction | undefined {
            return declaredSnippet(ctx, 'empty', () => []);
        }

        function resolveDS(): DataSource<unknown> | null {
            const explicitSource = ctx.source() as DataSource<unknown> | null;
            if (explicitSource) return explicitSource;
            if (!injectedDS) {
                injectedDS = inject(DataSourceContext, ctx.el, null) as DataSource<unknown> | null;
            }
            return injectedDS;
        }

        function getDataItems(): unknown[] {
            const ds = resolveDS();
            if (ds && ds.data) return ds.data() || [];
            const staticItems = ctx.items() as unknown[] | null;
            return staticItems || [];
        }

        function isLoading(): boolean {
            const ds = resolveDS();
            return ds ? ds.isLoading() : false;
        }

        function defaultRenderItem(item: unknown, index: number): Node {
            const record = item as Record<string, unknown>;
            const li = document.createElement('div');
            // Text only, written by the list: `.pdx-list-item-text` lets it be skipped off screen.
            li.className = 'pdx-list-item pdx-list-item-text';
            li.setAttribute('data-part', 'item');
            if (ctx.clickable()) { li.classList.add('pdx-list-item-clickable'); li.tabIndex = 0; }
            li.setAttribute('role', 'listitem');
            li.setAttribute('data-list-index', String(index));
            const idFieldName = ctx.idField() as string;
            if (record[idFieldName] != null) li.setAttribute('data-list-id', String(record[idFieldName]));

            const firstValue = Object.values(record).find(v => typeof v === 'string');
            li.textContent = (firstValue as string) || JSON.stringify(record);
            markPosition(li, index);
            return li;
        }

        /** The source, when it pages: a source of data and loading alone has no total to give. */
        function pagedSource(ds: DataSource<unknown> | null): Pick<DataSource<unknown>, 'total' | 'page' | 'pageSize'> | null {
            return ds && typeof ds.total === 'function' && typeof ds.page === 'function' && typeof ds.pageSize === 'function' ? ds : null;
        }

        /**
         * A3 (#292): when the list shows part of its source — a page, or the pages loaded so far — each
         * item says the source's total and its place in it. A list that shows all of its items says
         * nothing: the count of its items is the set's size. The offset is the page's, unless the
         * source has accumulated pages (infinite scroll), which start at the first item: an
         * accumulated set holds more than one page, since a page is appended only after a full one.
         */
        function markPositions(): void {
            if (!listEl) return;
            const rows = listEl.querySelectorAll<HTMLElement>(':scope > [data-part="item"]');
            rows.forEach((row, i) => markPosition(row, i));
        }

        /** One item's place in its source (A3), from the source's total and paging and the items shown. */
        function markPosition(row: HTMLElement, index: number): void {
            const ds = pagedSource(resolveDS());
            const shown = getDataItems().length;
            const total = ds ? ds.total() : -1;
            const pageSize = ds ? ds.pageSize() : 0;
            const offset = ds && pageSize > 0 && shown <= pageSize ? (ds.page() - 1) * pageSize : 0;
            if (total > shown) {
                row.setAttribute('aria-setsize', String(total));
                row.setAttribute('aria-posinset', String(offset + index + 1));
            } else {
                row.removeAttribute('aria-setsize');
                row.removeAttribute('aria-posinset');
            }
        }

        // Slot-based render: thin wrapper (role + data attrs only, no padding)
        function slotRender(item: unknown, index: number): Node {
            const itemSlot = getItemSlot();
            if (!itemSlot) return defaultRenderItem(item, index);
            const idFieldName = ctx.idField() as string;
            const record = item as Record<string, unknown>;
            const content = itemSlot({ item, index });

            // Structural wrapper: role + data + click, but NO padding (the snippet controls its own)
            const li = document.createElement('div');
            li.className = 'pdx-list-item pdx-list-item-slot';
            li.setAttribute('data-part', 'item');
            if (ctx.clickable()) { li.classList.add('pdx-list-item-clickable'); li.tabIndex = 0; }
            li.setAttribute('role', 'listitem');
            li.setAttribute('data-list-index', String(index));
            if (record[idFieldName] != null) li.setAttribute('data-list-id', String(record[idFieldName]));
            li.appendChild(content instanceof DocumentFragment ? content : content);
            markPosition(li, index);
            return li;
        }

        function buildEmptyState(): HTMLElement {
            const el = document.createElement('div');
            el.className = 'pdx-list-empty';
            el.setAttribute('data-part', 'empty');
            el.style.display = 'none';

            const emptySlot = getEmptySlot();
            if (emptySlot) {
                // The parent's empty snippet
                const content = emptySlot({});
                el.appendChild(content instanceof DocumentFragment ? content : content);
            } else {
                // Default empty state
                const emptyIconName = ctx.emptyIcon() as string;
                const emptyTitle = (ctx.emptyTitle() as string) || uiString('list', 'empty');
                const emptyDesc = ctx.emptyDescription() as string;

                // Its default icon is in the list's chunk: an empty list is what a page shows while
                // its items load, and loaded on demand it cost a request after the route had (#47).
                defineIcons({ inbox: iconInbox });
                const icon = document.createElement('pdx-icon');
                icon.setAttribute('name', emptyIconName);
                icon.setAttribute('size', '40');
                icon.className = 'pdx-empty-state-icon';
                el.appendChild(icon);

                const titleEl = document.createElement('div');
                titleEl.className = 'pdx-empty-state-title';
                titleEl.textContent = emptyTitle;
                el.appendChild(titleEl);

                if (emptyDesc) {
                    const descEl = document.createElement('div');
                    descEl.className = 'pdx-empty-state-desc';
                    descEl.textContent = emptyDesc;
                    el.appendChild(descEl);
                }
            }
            return el;
        }

        function buildList(): void {
            if (!listEl) return;

            const idFieldName = ctx.idField() as string;

            // The item snippet or slot, else the default renderer.
            const effectiveRenderFn: (item: unknown, index: number) => Node = getItemSlot() ? slotRender : defaultRenderItem;

            // Use repeatWithSlot for keyed reconciliation
            // We pass null for slotFn since we handle slot wrapping ourselves
            // (list items need wrapping in .pdx-list-item)
            repeatFragment = repeatWithSlot(
                () => getDataItems(),
                (item) => {
                    const record = item as Record<string, unknown>;
                    return record[idFieldName] ?? item;
                },
                null,               // slot handled manually (wrapping needed)
                effectiveRenderFn,  // our resolved render function
                defaultRenderItem,  // fallback
            );
            listEl.appendChild(repeatFragment);
        }

        // Event delegation for clicks
        function activateItem(listItem: HTMLElement): void {
            const index = parseInt(listItem.getAttribute('data-list-index') || '0', 10);
            const items = getDataItems();
            const item = items[index];
            const idFieldName = ctx.idField() as string;
            const record = item as Record<string, unknown>;
            ctx.emit('pdx-click', { item, index, id: record?.[idFieldName] });
        }

        function onListClick(e: Event): void {
            if (!ctx.clickable()) return;
            const target = e.target as HTMLElement;
            const listItem = target.closest('.pdx-list-item') as HTMLElement | null;
            if (!listItem || !listEl?.contains(listItem)) return;
            activateItem(listItem);
        }

        // Keyboard activation (WCAG 2.1.1): Enter/Space trigger the focused clickable item.
        function onListKeydown(e: KeyboardEvent): void {
            if (!ctx.clickable()) return;
            if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
            const target = e.target as HTMLElement;
            const listItem = target.closest('.pdx-list-item-clickable') as HTMLElement | null;
            if (!listItem || !listEl?.contains(listItem)) return;
            e.preventDefault(); // Space must not scroll the page
            activateItem(listItem);
        }

        ctx.track(() => {
            // Subscribe to all reactive sources
            void ctx.items();
            void ctx.source();
            const ds = resolveDS();
            if (ds) { void ds.data(); void ds.isLoading(); }
            // Its looks are states of the host (#292): list.css draws them, and the host carries no class.
            ctx.state('bordered', !!ctx.bordered());
            ctx.state('dividers', !!ctx.dividers());
            void ctx.clickable();
            void ctx.emptyTitle();
            void ctx.emptyDescription();
            void ctx.emptyIcon();
            void ctx.idField();

            const dataItems = getDataItems();
            const loading = isLoading();
            // What A3 reads, so a new total or page marks the items again.
            const paged = pagedSource(ds);
            if (paged) { void paged.total(); void paged.page(); void paged.pageSize(); }

            if (!built) {
                built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    // Block UI overlay
                    blockEl = document.createElement('div');
                    blockEl.className = 'pdx-block-ui-overlay';
                    blockEl.setAttribute('data-part', 'overlay');
                    blockEl.setAttribute('aria-hidden', 'true');
                    const spinWrap = document.createElement('div');
                    spinWrap.className = 'pdx-block-ui-spinner';
                    const spinner = document.createElement('pdx-spinner');
                    spinner.setAttribute('size', 'md');
                    spinWrap.appendChild(spinner);
                    blockEl.appendChild(spinWrap);
                    ctx.el.appendChild(blockEl);

                    // Empty state
                    emptyEl = buildEmptyState();
                    ctx.el.appendChild(emptyEl);

                    // List container
                    listEl = document.createElement('div');
                    listEl.className = 'pdx-list';
                    listEl.setAttribute('data-part', 'list');
                    listEl.setAttribute('role', 'list');
                    listEl.addEventListener('click', onListClick);
                    listEl.addEventListener('keydown', onListKeydown);
                    applyName();
                    ctx.el.appendChild(listEl);

                    buildList();

                    // Initial state
                    showEmpty(dataItems.length === 0 && !loading);
                    showBusy(loading);
                    markPositions();
                });
                return;
            }

            // Update visibility. The items already shown are marked again a frame later, once the
            // keyed list has placed the rows a new total or page moved (a new row is marked as built).
            requestAnimationFrame(() => {
                showEmpty(dataItems.length === 0 && !loading);
                showBusy(loading);
                requestAnimationFrame(markPositions);
            });
        });

        ctx.expose({
            refresh: () => {
                const ds = ctx.source() as DataSource<unknown> | null;
                if (ds) ds.refresh();
            },
        });

        return {};
    },
    render: () => html``,
});

/** The item a snippet receives, the app's (#651): the editor infers it from `:items` or `:source`. */
type T = unknown;
