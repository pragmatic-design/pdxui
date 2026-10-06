// pdx-list — Data-bound list component with scoped slot support.
// Priority: slot template (declarative) > renderItem callback > default renderer.
// Uses keyed reconciliation (repeat/LIS) instead of innerHTML rebuild.
//
// Slot usage:
//   <pdx-list :items="${users}">
//     <slot name="item" let:item let:index>
//       <div>${item.name}</div>
//     </slot>
//     <slot name="empty">
//       <div>No users found</div>
//     </slot>
//   </pdx-list>
//
// Callback (backward compat):
//   <pdx-list :items="${users}" :render-item="${renderUser}">

import { component, html, tryInject, repeatWithSlot } from '@pdxui/core';
import type { DataSource, SlotFunction } from '@pdxui/core';
import { sanitizeHTML } from '../shared/sanitize';
import { uiString } from '../shared/i18n';
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
import '../spinner/pdx-spinner'; // rendered by this component, and registered by nobody else

export interface ListItem {
    [key: string]: unknown;
}

/**
 * A list bound to data, an array or a DataSource, with custom item templates, a loading overlay
 * and an empty state.
 *
 * @slot item - Scoped — renders one item. Receives `{ item, index, id }` (`id` is the value of `id-field`).
 * @slot empty - Shown when the list has no items. Receives nothing, but write it `<slot name="empty" let:_>`: without a `let:` the compiler reads a `<slot>` as plain HTML and the template is ignored.
 */
component('pdx-list', {
    props: {
        items: { type: Array, default: null },
        source: { type: Object, default: null },
        renderItem: { type: Object, default: null },
        idField: { type: String, default: 'id' },
        dividers: { type: Boolean, default: false },
        clickable: { type: Boolean, default: false },
        bordered: { type: Boolean, default: true },
        /** The empty state's title. Empty: the list.empty component string, «No items». */
        emptyTitle: { type: String, default: '' },
        emptyDescription: { type: String, default: '' },
        emptyIcon: { type: String, default: 'inbox' },
    },
    setup(ctx) {
        let built = false;
        let listEl: HTMLElement | null = null;
        let emptyEl: HTMLElement | null = null;

        /** Show or hide the empty state; the first time it shows its icon, load `pdx-icon`. */
        function showEmpty(show: boolean): void {
            if (!emptyEl) return;
            emptyEl.style.display = show ? '' : 'none';
            if (show && emptyEl.querySelector('pdx-icon') && !customElements.get('pdx-icon')) void import('../icon/pdx-icon');
        }
        let blockEl: HTMLElement | null = null;
        let repeatFragment: DocumentFragment | null = null;

        let injectedDS: DataSource<unknown> | null = null;

        // Slot functions — read lazily (populated by _projectSlots AFTER setup)
        function getItemSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['item'] as SlotFunction | undefined;
        }
        function getEmptySlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['empty'] as SlotFunction | undefined;
        }

        function resolveDS(): DataSource<unknown> | null {
            const explicitSource = ctx.source() as DataSource<unknown> | null;
            if (explicitSource) return explicitSource;
            if (!injectedDS) {
                try { injectedDS = tryInject('dataSource', ctx.el) as DataSource<unknown> | null; } catch { injectedDS = null; }
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
            li.className = 'pdx-list-item';
            if (ctx.clickable()) { li.classList.add('pdx-list-item-clickable'); li.tabIndex = 0; }
            li.setAttribute('role', 'listitem');
            li.setAttribute('data-list-index', String(index));
            const idFieldName = ctx.idField() as string;
            if (record[idFieldName] != null) li.setAttribute('data-list-id', String(record[idFieldName]));

            const firstValue = Object.values(record).find(v => typeof v === 'string');
            li.textContent = (firstValue as string) || JSON.stringify(record);
            return li;
        }

        function wrapInListItem(node: Node, item: unknown, index: number): Node {
            // If the slot/callback already returns a .pdx-list-item, use it directly
            if (node instanceof HTMLElement && node.classList.contains('pdx-list-item')) {
                node.setAttribute('role', 'listitem');
                node.setAttribute('data-list-index', String(index));
                const idFieldName = ctx.idField() as string;
                const record = item as Record<string, unknown>;
                if (record[idFieldName] != null) node.setAttribute('data-list-id', String(record[idFieldName]));
                if (ctx.clickable()) { node.classList.add('pdx-list-item-clickable'); node.tabIndex = 0; }
                return node;
            }
            // Wrap in standard list item
            const li = document.createElement('div');
            li.className = 'pdx-list-item';
            if (ctx.clickable()) { li.classList.add('pdx-list-item-clickable'); li.tabIndex = 0; }
            li.setAttribute('role', 'listitem');
            li.setAttribute('data-list-index', String(index));
            const idFieldName = ctx.idField() as string;
            const record = item as Record<string, unknown>;
            if (record[idFieldName] != null) li.setAttribute('data-list-id', String(record[idFieldName]));
            li.appendChild(node);
            return li;
        }

        // Wrap renderItem callback to produce proper list items
        function callbackRender(item: unknown, index: number): Node {
            const renderFn = ctx.renderItem() as ((item: unknown, index: number) => HTMLElement | string) | null;
            if (!renderFn) return defaultRenderItem(item, index);
            const content = renderFn(item, index);
            if (typeof content === 'string') {
                const li = document.createElement('div');
                li.className = 'pdx-list-item';
                if (ctx.clickable()) { li.classList.add('pdx-list-item-clickable'); li.tabIndex = 0; }
                li.setAttribute('role', 'listitem');
                li.setAttribute('data-list-index', String(index));
                li.innerHTML = sanitizeHTML(content);
                return li;
            }
            return wrapInListItem(content, item, index);
        }

        // Slot-based render: thin wrapper (role + data attrs only, no padding)
        function slotRender(item: unknown, index: number): Node {
            const itemSlot = getItemSlot();
            if (!itemSlot) return defaultRenderItem(item, index);
            const idFieldName = ctx.idField() as string;
            const record = item as Record<string, unknown>;
            const scope = { item, index, id: record[idFieldName] };
            const content = itemSlot(scope);

            // Structural wrapper: role + data + click, but NO padding (slot controls its own)
            const li = document.createElement('div');
            li.className = 'pdx-list-item pdx-list-item-slot';
            if (ctx.clickable()) { li.classList.add('pdx-list-item-clickable'); li.tabIndex = 0; }
            li.setAttribute('role', 'listitem');
            li.setAttribute('data-list-index', String(index));
            if (record[idFieldName] != null) li.setAttribute('data-list-id', String(record[idFieldName]));
            li.appendChild(content instanceof DocumentFragment ? content : content);
            return li;
        }

        function buildEmptyState(): HTMLElement {
            const el = document.createElement('div');
            el.className = 'pdx-list-empty';
            el.style.display = 'none';

            const emptySlot = getEmptySlot();
            if (emptySlot) {
                // Use empty slot
                const content = emptySlot({});
                el.appendChild(content instanceof DocumentFragment ? content : content);
            } else {
                // Default empty state
                const emptyIconName = ctx.emptyIcon() as string;
                const emptyTitle = (ctx.emptyTitle() as string) || uiString('list', 'empty');
                const emptyDesc = ctx.emptyDescription() as string;

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
            const renderFn = ctx.renderItem() as ((item: unknown, index: number) => HTMLElement | string) | null;

            // Determine effective render function (slot > callback > default)
            let effectiveRenderFn: (item: unknown, index: number) => Node;
            const itemSlot = getItemSlot();
            if (itemSlot) {
                effectiveRenderFn = slotRender;
            } else if (renderFn) {
                effectiveRenderFn = callbackRender;
            } else {
                effectiveRenderFn = defaultRenderItem;
            }

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
            void ctx.bordered();
            void ctx.dividers();
            void ctx.clickable();
            void ctx.renderItem();
            void ctx.emptyTitle();
            void ctx.emptyDescription();
            void ctx.emptyIcon();
            void ctx.idField();

            const dataItems = getDataItems();
            const loading = isLoading();

            if (!built) {
                built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    const bordered = ctx.bordered() as boolean;
                    const dividers = ctx.dividers() as boolean;
                    ctx.el.classList.add('pdx-list-root');
                    if (bordered) ctx.el.classList.add('pdx-list-bordered');

                    // Block UI overlay
                    blockEl = document.createElement('div');
                    blockEl.className = 'pdx-block-ui-overlay';
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
                    if (dividers) listEl.classList.add('pdx-list-dividers');
                    listEl.setAttribute('role', 'list');
                    listEl.addEventListener('click', onListClick);
                    listEl.addEventListener('keydown', onListKeydown);
                    ctx.el.appendChild(listEl);

                    buildList();

                    // Initial state
                    showEmpty(dataItems.length === 0 && !loading);
                    if (blockEl) blockEl.classList.toggle('pdx-block-ui-visible', loading);
                });
                return;
            }

            // Update visibility
            requestAnimationFrame(() => {
                showEmpty(dataItems.length === 0 && !loading);
                if (blockEl) {
                    blockEl.classList.toggle('pdx-block-ui-visible', loading);
                }
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
