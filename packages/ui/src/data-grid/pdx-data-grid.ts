// pdx-data-grid — Enterprise data grid component.
// Architecture: shell component that delegates to focused sub-modules.
// DataSource is mandatory — arrays are auto-wrapped.
//
// Sub-modules:
//   grid-context.ts  — shared context + applyColSize
//   grid-header.ts   — header row, sort carets, resize handles
//   grid-body.ts     — row rendering, cell formatting
//   grid-filter.ts   — inline filter row
//   grid-selection.ts — checkbox, select-all, range
//   grid-footer.ts   — pdx-pagination integration

import { component, html, useDataGrid, isDataSource, createDataSource, effect, onDestroy, componentStringsChanged, DEV } from '@pdxui/core';
import type { SlotFunction, DataSource, ColumnDef, Dispose, GridState } from '@pdxui/core';
import type { GridContext, AnyColumn } from './grid-context';
import { buildHeader } from './grid-header';
import { renderRows } from './grid-body';
import { buildFilterRow } from './grid-filter';
import { toggleSelect, selectAll, clearSelection, setSelection } from './grid-selection';
import { renderGroupedRows } from './grid-grouping';
import { setupVirtualScroll } from './grid-virtual';
import type { VirtualScrollState } from './grid-virtual';
import { buildFooter, updateFooter } from './grid-footer';
import { buildSummaryRow, hasSummary } from './grid-summary';
import { buildToolbar, updateToolbar, openAddFilterPopover } from './grid-toolbar';
import { openColumnMenu, closeColumnMenu } from './grid-column-menu';
import { openFilterPopover, closeFilterPopover } from './grid-filter-popover';
import { buildGroupBar, updateGroupBar } from './grid-group-bar';
import { toggleRowDetail as toggleRowDetailFn } from './grid-detail';
import { addRow as addRowFn, deleteRow as deleteRowFn, openEditDialog, startRowEdit as startRowEditFn, commitBatch, revertBatch, setupGridKeyboard } from './grid-edit';
import { applyGridAria, applyRoving, setupGridNav } from './grid-a11y';
import { trackInputModality } from './grid-input-modality';
import { t } from './grid-i18n'; // also registers the default strings

// Runtime sub-components created via document.createElement (toolbar/filter/edit/footer).
// Imported here so the data-grid self-registers its dependencies in any consumer,
// regardless of whether the host template references these tags statically.
import '../button/pdx-button';
/** `pdx-icon` the first time the empty state shows: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}
import '../input/pdx-input';
import '../number-input/pdx-number-input';
import '../select/pdx-select';
import '../date-picker/pdx-date-picker';
import '../form-field/pdx-form-field';
import '../dialog/pdx-dialog';
import '../pagination/pdx-pagination';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/data-grid';
import '../spinner/pdx-spinner'; // rendered by this component, and registered by nobody else

// Measured once: width the OS reserves for a classic scrollbar (0 on overlay-scrollbar systems).
// Used in fill mode to reserve the same gutter on the header/filter row as the body's vertical
// scrollbar consumes, so columns stay aligned.
let _scrollbarWidth = -1;
function scrollbarWidth(): number {
    if (_scrollbarWidth >= 0) return _scrollbarWidth;
    const outer = document.createElement('div');
    outer.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll';
    document.body.appendChild(outer);
    _scrollbarWidth = outer.offsetWidth - outer.clientWidth;
    outer.remove();
    return _scrollbarWidth;
}

/** Grids already told that their rowHeight does nothing: once per element, not once per rebuild. */
const _warnedRowHeight = new WeakSet<Element>();

/**
 * rowHeight places rows by number, which is what virtualisation needs; a content grid sizes its rows
 * by what they hold and should not clip them. So without virtualScroll it does nothing — and says so,
 * rather than being ignored in silence.
 */
function warnRowHeightIgnored(el: Element): void {
    if (!DEV || _warnedRowHeight.has(el)) return;
    _warnedRowHeight.add(el);
    console.warn(
        '[pdx-data-grid] rowHeight is set, but it applies only with virtualScroll: a plain grid sizes ' +
        'its rows by their content. Add virtual-scroll, or remove row-height.',
    );
}

/**
 * A data grid with sorting, pagination and type-aware cell rendering, whose cells and headers can be
 * replaced with slot templates.
 */
component('pdx-data-grid', {
    props: {
        source: { type: Object, default: null },
        columns: { type: Array, default: null },
        data: { type: Array, default: null },
        striped: { type: Boolean, default: false },
        hover: { type: Boolean, default: true },
        /**
         * The rows open something: a click on a row is handled (`pdx-row-click`), so the row takes
         * a pointer, so a page does not write its own `.pdx-dg-row { cursor: pointer }`, reaching into
         * this component's internal class. Enter on a row is unchanged: it edits a cell in an
         * editable grid and does nothing otherwise, so give a keyboard reader a way in of its own
         * (an `actions()` column).
         */
        rowClickable: { type: Boolean, default: false },
        compact: { type: Boolean, default: false },
        stickyHeader: { type: Boolean, default: true },
        selection: { type: String, default: 'none' },
        /**
         * A class for the whole row: a string, or `(row, index) => string`. Marks a row invalid,
         * new, stale — what `cellClass` could only do one column at a time.
         *
         * Declared `String` because an ATTRIBUTE is one (`row-class="compact"`), and `PropType` is
         * a single constructor. A function assigned as a JS property arrives untouched: `coerce`
         * returns a non-string value as it is (`component.ts:448`).
         */
        rowClass: { type: String, default: '' },
        idField: { type: String, default: 'id' },
        stateKey: { type: String, default: '' },
        /** The empty state's text. Unset, it is the grid string `empty.title`. */
        emptyTitle: { type: String, default: '' },
        emptyIcon: { type: String, default: 'inbox' },
        showFooter: { type: Boolean, default: true },
        filterable: { type: Boolean, default: false },
        filterMode: { type: String, default: 'none' },
        showToolbar: { type: Boolean, default: false },
        /** A search field at the toolbar's right: the term is looked for in the columns marked `searchable`. */
        search: { type: Boolean, default: false },
        showGroupBar: { type: Boolean, default: false },
        paginationPosition: { type: String, default: 'bottom' },
        /** The rows-per-page choices the footer's pager offers; empty, it offers none. */
        pageSizes: { type: Array, default: [] },
        expandable: { type: Boolean, default: false },
        rowReorder: { type: Boolean, default: false },
        groupBy: { type: Array, default: null },
        virtualScroll: { type: Boolean, default: false },
        /** Row height in px for virtual scrolling (42 when unset); ignored otherwise. */
        rowHeight: { type: Number, default: 0 },
        /** Caps the grid height in px; the body scrolls beyond it. 0 = no cap (a virtual grid uses 400). */
        maxHeight: { type: Number, default: 0 },
        /** Fill the parent's height (flex) instead of growing with content. The page no longer
         *  scrolls — only the grid body scrolls (virtualized). Pair with virtual-scroll for large sets. */
        fillHeight: { type: Boolean, default: false },
        editable: { type: Boolean, default: false },
        editMode: { type: String, default: 'cell' },
        /** The grid's accessible name (its aria-label). */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        let rootEl: HTMLElement | null = null;
        /** The role="grid" element (the scroll area), once the build has put it in the page. */
        let gridEl: HTMLElement | null = null;
        let headerEl: HTMLElement | null = null;
        let bodyEl: HTMLElement | null = null;
        let footerEl: HTMLElement | null = null;
        let footerTopEl: HTMLElement | null = null;
        let summaryEl: HTMLElement | null = null;
        let scrollEl: HTMLElement | null = null;
        let toolbarEl: HTMLElement | null = null;
        let groupBarEl: HTMLElement | null = null;
        let loadingEl: HTMLElement | null = null;
        let emptyEl: HTMLElement | null = null;

        /** Show or hide the empty state; the first time it shows its icon, load `pdx-icon`. */
        function showEmpty(show: boolean): void {
            if (!emptyEl) return;
            emptyEl.style.display = show ? '' : 'none';
            if (show && emptyEl.querySelector('pdx-icon')) loadIcon();
        }
        let gridEffect: Dispose | null = null;
        let virtualState: VirtualScrollState | null = null;
        let cachedDS: DataSource<Record<string, unknown>> | null = null;
        let cachedDataRef: unknown = undefined;

        // Resolve filter mode: toolbar active → always 'toolbar' (never inline row)
        function resolveFilterMode(): string {
            if (ctx.showToolbar()) return 'toolbar';
            const mode = ctx.filterMode() as string;
            if (mode && mode !== 'none') return mode;
            return ctx.filterable() ? 'row' : 'none';
        }

        // ─── Shared context for sub-modules ──────────
        const gc: GridContext = {
            grid: null,
            getSlot: (name: string) => (ctx as any).__slots?.[name] as SlotFunction | undefined,
            getSelectionMode: () => (ctx.selection() as string) || 'none',
            getRowClass: (row: Record<string, unknown>, index: number) => {
                const rc = ctx.rowClass() as string | ((r: Record<string, unknown>, i: number) => string) | undefined;
                if (!rc) return '';
                return (typeof rc === 'function' ? rc(row, index) : rc) || '';
            },
            getIdField: () => (ctx.idField() as string) || 'id',
            selectedIds: new Set(),
            emit: (name, detail) => ctx.emit(name, detail),
            getHeaderEl: () => headerEl,
            getBodyEl: () => bodyEl,
            hasFilterRow: () => resolveFilterMode() === 'row',
            hasToolbar: () => !!(ctx.showToolbar()),
            hasSearch: () => !!(ctx.search()),
            pageSizes: () => (ctx.pageSizes() as number[] | null) ?? [],
            filterMode: () => resolveFilterMode(),
            popoverFilters: {},
            inlineFilterValues: {},
            inlineFilterOps: {},
            isExpandable: () => !!(ctx.expandable()),
            isRowReorder: () => !!(ctx.rowReorder()),
            expandedRows: new Set(),
            collapsedGroups: new Set(),
            editMode: () => ctx.editable() ? (ctx.editMode() as string) || 'cell' : 'none',
            editingCell: null,
            editingRowId: null,
            editForm: null,
            batchChanges: new Map(),
            getLabel: () => (ctx.label() as string) || '',
            nav: null,
            navFocused: false,
            afterRender: () => refreshA11y(),
            forceUpdate: () => {
                requestAnimationFrame(() => {
                    if (!gc.grid) return;
                    const cols = gc.grid.columns.peek();
                    const rows = gc.grid.rows.peek();
                    if (headerEl) {
                        const parent = headerEl.parentElement;
                        if (parent) {
                            const newHeader = buildHeader(gc, cols);
                            parent.replaceChild(newHeader, headerEl);
                            headerEl = newHeader;
                        }
                    }
                    if (bodyEl && !virtualState) {
                        renderRows(gc, bodyEl, rows, cols);
                    }
                    if (virtualState) virtualState.update();
                    rebuildSummary(cols);
                    if (toolbarEl) updateToolbar(gc, toolbarEl);
                    refreshA11y();
                });
            },
        };

        /** Counts, indices, selection state and the roving tab stop, after any render. */
        function refreshA11y(): void {
            if (!gridEl) return;
            applyGridAria(gc, gridEl);
            applyRoving(gc, gridEl);
        }

        /** Rebuild (or add/remove) the summary row for the current columns + rows. */
        function rebuildSummary(cols: AnyColumn[]): void {
            const needed = hasSummary(cols);
            if (summaryEl) {
                if (needed) {
                    const next = buildSummaryRow(gc, cols);
                    summaryEl.replaceWith(next);
                    summaryEl = next;
                } else {
                    summaryEl.remove();
                    summaryEl = null;
                }
            } else if (needed && scrollEl && bodyEl) {
                summaryEl = buildSummaryRow(gc, cols);
                bodyEl.after(summaryEl); // sticky sibling directly after the body
            }
        }

        /** Render body — grouped or flat depending on DataSource state. */
        function renderBody(rows: Record<string, unknown>[], cols: AnyColumn[]): void {
            if (!bodyEl) return;
            // Read groups from DataSource (signal)
            const groupsFn = gc.grid?.source?.groups;
            const groups = typeof groupsFn === 'function' ? groupsFn() : undefined;
            if (groups && Array.isArray(groups) && groups.length > 0) {
                bodyEl.innerHTML = '';
                renderGroupedRows(gc, bodyEl, groups as any, cols, renderRows);
            } else {
                renderRows(gc, bodyEl, rows, cols);
            }
        }

        // A lone modifier held for the next click draws no focus ring.
        const stopModality = trackInputModality(ctx.el);

        // Internal event routing (from sub-modules)
        ctx.el.addEventListener('__select-all', () => selectAll(gc));
        ctx.el.addEventListener('__toggle-select', ((e: CustomEvent) => {
            toggleSelect(gc, e.detail.id, e.detail.shiftKey);
        }) as EventListener);
        ctx.el.addEventListener('__group-toggle', () => {
            if (bodyEl && gc.grid) {
                renderBody(gc.grid.rows.peek(), gc.grid.columns.peek());
                refreshA11y();
            }
        });
        ctx.el.addEventListener('__toggle-detail', ((e: CustomEvent) => {
            toggleRowDetailFn(gc, e.detail.id);
            if (bodyEl && gc.grid) {
                renderBody(gc.grid.rows.peek(), gc.grid.columns.peek());
                refreshA11y();
            }
        }) as EventListener);

        // ─── DataSource resolution ───────────────────
        function resolveSource(): DataSource<Record<string, unknown>> {
            const src = ctx.source();
            if (src && isDataSource(src)) return src as DataSource<Record<string, unknown>>;
            const rawDataRef = ctx.data();
            const rawData = (rawDataRef ?? []) as Record<string, unknown>[];
            // Rebuild the array-backed source when the `data` prop reference changes — otherwise a
            // post-mount `data` swap would keep showing the first dataset (stale cache).
            if (!cachedDS || cachedDataRef !== rawDataRef) {
                cachedDS = createDataSource({ data: rawData, pageSize: 0 });
                cachedDataRef = rawDataRef;
            }
            return cachedDS;
        }

        function resolveColumns(): ColumnDef[] {
            const cols = ctx.columns() as ColumnDef[] | null;
            if (cols && cols.length > 0) return cols;
            const rawData = (ctx.data() ?? []) as Record<string, unknown>[];
            if (rawData.length > 0) {
                return Object.keys(rawData[0]).map(field => ({ field }));
            }
            const dsRows = gc.grid?.source?.data.peek() ?? [];
            if (dsRows.length > 0) {
                return Object.keys(dsRows[0]).map(field => ({ field }));
            }
            return [];
        }

        // What `whenReady()` hands out: settled by the first build, and settled once — a rebuild
        // (new columns, a new source) does not make the grid unready.
        let resolveReady: () => void = () => {};
        const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
        let isReady = false;

        // ─── Build grid DOM ──────────────────────────
        function buildGrid(): void {
            if (!rootEl) return;
            rootEl.innerHTML = '';
            gridEl = null;

            const ds = resolveSource();
            const columns = resolveColumns();

            (gc.grid as any)?.dispose?.();
            gc.grid = useDataGrid({
                source: ds,
                columns,
                idField: gc.getIdField(),
                stickyHeader: ctx.stickyHeader() as boolean,
                stateKey: (ctx.stateKey() as string) || undefined,
                // What a reader did to the columns, out as an event. One name per
                // action: a consumer that wants to know a column moved should not have to diff a
                // snapshot. `loadState` does not come through here — putting a saved view back is
                // not something a reader did.
                onColumnChange: (change) => {
                    const { kind, ...detail } = change;
                    gc.emit(kind === 'reorder' ? 'pdx-column-reorder'
                        : kind === 'visibility' ? 'pdx-column-visibility-change'
                        : 'pdx-column-resize', detail);
                    // And REPAINT, here rather than at each call site: wired where the change is
                    // reported, no call site can forget it, as a header drop would otherwise
                    // reorder the model and leave the screen as it was.
                    // The effect that rebuilds the header tracks `columns()` and
                    // that IS enough under happy-dom — `packages/core` asserts the computed
                    // notifies on a reorder, a hide and a `loadState`, and the ui unit row passes
                    // with this line removed. In CHROMIUM it is not: without it, dragging a column
                    // reorders the model and leaves the header where it is, and `views.spec.ts`
                    // measures it. Why the two disagree is not
                    // established — the rAF the effect schedules is the suspect.
                    gc.forceUpdate();
                },
            });

            // Apply grouping if specified
            const groupBy = ctx.groupBy() as { field: string; dir?: 'asc' | 'desc'; aggregates?: { field: string; aggregate: string }[] }[] | null;
            if (groupBy && groupBy.length > 0) {
                gc.grid.source.setGroup(groupBy as any);
            }

            const wrap = document.createElement('div');
            wrap.className = 'pdx-dg';
            if (ctx.striped()) wrap.classList.add('pdx-dg-striped');
            if (ctx.hover()) wrap.classList.add('pdx-dg-hover');
            if (ctx.rowClickable()) wrap.classList.add('pdx-dg-rows-clickable');
            if (ctx.compact()) wrap.classList.add('pdx-dg-compact');
            if (ctx.stickyHeader()) wrap.classList.add('pdx-dg-sticky');
            if (ctx.fillHeight()) {
                wrap.classList.add('pdx-dg-fill');
                // Reserve the body's scrollbar gutter on the header/filter row → columns stay aligned.
                wrap.style.setProperty('--pdx-dg-sbw', scrollbarWidth() + 'px');
            }
            // The editor's Tab/Enter (commit and move), only when editable.
            if (gc.editMode() !== 'none') {
                setupGridKeyboard(gc, wrap);
            }

            // Toolbar (above scroll area)
            toolbarEl = null;
            if (ctx.showToolbar()) {
                toolbarEl = buildToolbar(gc);
                updateToolbar(gc, toolbarEl);
                wrap.appendChild(toolbarEl);
            }

            // Group bar (below toolbar, above scroll area)
            groupBarEl = null;
            if (ctx.showGroupBar()) {
                groupBarEl = buildGroupBar(gc);
                wrap.appendChild(groupBarEl);
            }

            const pagPos = (ctx.paginationPosition() as string) || 'bottom';

            // Pagination top
            footerTopEl = null;
            if (ctx.showFooter() && !ctx.virtualScroll() && (pagPos === 'top' || pagPos === 'both')) {
                footerTopEl = buildFooter(gc);
                updateFooter(gc, footerTopEl);
                wrap.appendChild(footerTopEl);
            }

            scrollEl = document.createElement('div');
            scrollEl.className = 'pdx-dg-scroll';
            // The grid is the scroll area — header, filter row, body, summary: a grid owns rows, and
            // the toolbar, the group bar and the pager beside it are not rows. The keyboard model is
            // the grid's, for every grid.
            scrollEl.setAttribute('role', 'grid');
            setupGridNav(gc, scrollEl);

            headerEl = buildHeader(gc, gc.grid.columns.peek());
            scrollEl.appendChild(headerEl);

            if (resolveFilterMode() === 'row') {
                scrollEl.appendChild(buildFilterRow(gc, gc.grid.columns.peek()));
            }

            bodyEl = document.createElement('div');
            bodyEl.className = 'pdx-dg-body';
            bodyEl.setAttribute('role', 'rowgroup');

            // Virtual scroll or normal rendering
            virtualState?.dispose();
            virtualState = null;
            if (ctx.virtualScroll()) {
                const g = gc.grid;
                virtualState = setupVirtualScroll(
                    gc, bodyEl,
                    (ctx.rowHeight() as number) || 42,
                    (ctx.maxHeight() as number) || 400,
                    () => g.rows.peek(),
                    () => g.columns.peek(),
                    gc.getSlot,
                    ctx.fillHeight() as boolean,
                );
            } else {
                // maxHeight caps a plain grid too: the scroll element holds the header and the body,
                // is overflow-y: auto in data-grid.css, and the header stays sticky inside it. Read
                // only by the virtual branch, `:max-height="620"` would cap nothing.
                const cap = ctx.maxHeight() as number;
                if (cap > 0 && !ctx.fillHeight()) scrollEl.style.maxHeight = `${cap}px`;
                if ((ctx.rowHeight() as number) > 0) warnRowHeightIgnored(ctx.el);
                renderBody(gc.grid.rows.peek(), gc.grid.columns.peek());
            }
            scrollEl.appendChild(bodyEl);

            // Summary / total row (aggregates) — sticky bottom sibling of the body, OUTSIDE the
            // virtualized viewport. Rendered only when ≥1 visible column declares `aggregate`.
            summaryEl = null;
            if (hasSummary(gc.grid.columns.peek())) {
                summaryEl = buildSummaryRow(gc, gc.grid.columns.peek());
                scrollEl.appendChild(summaryEl);
            }

            wrap.appendChild(scrollEl);

            // Empty state
            emptyEl = buildEmptyState();
            const rows = gc.grid.rows.peek();
            const loading = gc.grid.isLoading.peek();
            showEmpty(rows.length === 0 && !loading);
            wrap.appendChild(emptyEl);

            // Loading overlay
            loadingEl = document.createElement('div');
            loadingEl.className = 'pdx-dg-loading';
            loadingEl.innerHTML = '<pdx-spinner size="24"></pdx-spinner>';
            loadingEl.style.display = loading ? '' : 'none';
            wrap.appendChild(loadingEl);

            // Footer bottom — hide when virtual scroll (all rows visible, no pagination)
            footerEl = null;
            if (ctx.showFooter() && !ctx.virtualScroll() && (pagPos === 'bottom' || pagPos === 'both')) {
                footerEl = buildFooter(gc);
                updateFooter(gc, footerEl);
                wrap.appendChild(footerEl);
            }

            gridEl = scrollEl;
            rootEl.appendChild(wrap);
            refreshA11y();

            // Reactive effect — updates DOM when grid signals change
            gridEffect?.();
            const g = gc.grid;
            gridEffect = effect(() => {
                // The library's dictionary, as a VERSION rather than as a string: the grid writes
                // its accessible names once, when it builds a header or a row, so a translation
                // installed after the first render would never reach what is already on screen.
                // An app that loads its dictionaries before the first paint does not see it; one
                // whose locale arrives as a chunk would keep an English `aria-label` on a
                // translated page.
                //
                // Read here and not through `uiAttr`, which is what the rest of @pdxui/ui
                // uses: this grid writes a name per ROW, and a virtualised list would push
                // thousands of entries into that registry on every scroll. One tracked read
                // rebuilds the header and the rows, which is where the names are.
                componentStringsChanged();
                const newRows = g.rows();
                const newCols = g.columns();
                const newLoading = g.isLoading();
                void g.total();
                void g.page();
                void g.totalPages();
                void g.sortState();
                void g.source.filter();
                void g.source.group(); // Track group descriptors for group bar updates
                // Read groups inside effect (tracked) — pass to rAF as snapshot
                const groupsFn = g.source.groups;
                const newGroups = typeof groupsFn === 'function' ? groupsFn() : undefined;

                requestAnimationFrame(() => {
                    if (!bodyEl || !headerEl) return;

                    const parent = headerEl.parentElement;
                    if (parent) {
                        const newHeader = buildHeader(gc, newCols);
                        parent.replaceChild(newHeader, headerEl);
                        headerEl = newHeader;
                    }

                    // Render body. In virtual mode the virtualizer owns the DOM, but it has NO
                    // reactive subscription to the data — so when rows change (sort/filter/page)
                    // we must refresh its window explicitly, otherwise it shows stale rows.
                    if (!virtualState) {
                        if (newGroups && Array.isArray(newGroups) && newGroups.length > 0) {
                            bodyEl!.innerHTML = '';
                            renderGroupedRows(gc, bodyEl!, newGroups as any, newCols, renderRows);
                        } else {
                            renderRows(gc, bodyEl!, newRows, newCols);
                        }
                    } else {
                        virtualState.update();
                    }

                    // Summary row — recompute aggregates over the current rows (sort/filter/page).
                    rebuildSummary(newCols);

                    showEmpty(newRows.length === 0 && !newLoading);
                    if (loadingEl) {
                        loadingEl.style.display = newLoading ? '' : 'none';
                    }
                    if (footerEl) updateFooter(gc, footerEl);
                    if (footerTopEl) updateFooter(gc, footerTopEl);
                    if (toolbarEl) updateToolbar(gc, toolbarEl);
                    if (groupBarEl) updateGroupBar(gc, groupBarEl);
                    refreshA11y();
                });
            });
        }

        // ─── Empty state ─────────────────────────────
        function buildEmptyState(): HTMLElement {
            const emptySlot = gc.getSlot('empty');
            if (emptySlot) {
                const wrapper = document.createElement('div');
                wrapper.className = 'pdx-dg-empty';
                wrapper.setAttribute('role', 'status');
                const content = emptySlot({});
                wrapper.appendChild(content instanceof DocumentFragment ? content : content);
                return wrapper;
            }

            const el = document.createElement('div');
            el.className = 'pdx-dg-empty';
            // A status: "No data" is what a filter that matches nothing has to say.
            el.setAttribute('role', 'status');
            const icon = document.createElement('div');
            icon.className = 'pdx-dg-empty-icon';
            // Built with the grid and hidden while it has rows: `pdx-icon` is loaded when it SHOWS.
            const pdxIcon = document.createElement('pdx-icon');
            pdxIcon.setAttribute('name', (ctx.emptyIcon() as string) || 'inbox');
            pdxIcon.setAttribute('size', '40');
            icon.appendChild(pdxIcon);
            el.appendChild(icon);
            const txt = document.createElement('div');
            txt.className = 'pdx-dg-empty-text';
            txt.textContent = (ctx.emptyTitle() as string) || t('empty.title');
            el.appendChild(txt);
            return el;
        }

        // ─── Track prop changes ──────────────────────
        ctx.track(() => {
            void ctx.source();
            void ctx.columns();
            void ctx.data();
            void ctx.striped();
            void ctx.hover();
            void ctx.compact();
            void ctx.stickyHeader();
            void ctx.selection();
            void ctx.idField();
            void ctx.showFooter();
            void ctx.filterable();
            void ctx.filterMode();
            void ctx.showToolbar();
            void ctx.search();
            void ctx.showGroupBar();
            void ctx.paginationPosition();
            void ctx.pageSizes();
            void ctx.expandable();
            void ctx.groupBy();
            void ctx.virtualScroll();
            void ctx.fillHeight();
            void ctx.rowHeight();
            void ctx.maxHeight();
            void ctx.editable();
            void ctx.editMode();
            void ctx.label();

            // ctx.frame: a setup a move destroyed does not build again.
            ctx.frame(() => {
                if (!rootEl) {
                    rootEl = document.createElement('div');
                    rootEl.className = 'pdx-dg-root';
                    ctx.el.appendChild(rootEl);
                }
                buildGrid();
                if (!isReady) {
                    isReady = true;
                    resolveReady();
                    // The event is for a caller that holds the element before it is up — a page's
                    // `:ref` — when nothing is exposed on it yet but a listener can be added.
                    ctx.emit('pdx-ready');
                }
            });
        });

        // Expose the imperative API flattened on the host element (ctx.expose): e.g.
        // document.querySelector('pdx-data-grid').openColumnMenu(...) / .getSelectedIds().
        ctx.expose({
            get grid() { return gc.grid; },
            /**
             * Resolves once the grid is built and `grid`, `applyState` and the rest can be used.
             * The build is a frame after the element connects; until then `applyState` does nothing.
             * A caller that asks later is answered at once.
             */
            whenReady(): Promise<void> { return ready; },
            /** Open the column menu anchored to this element. */
            openColumnMenu(anchorEl: HTMLElement) { openColumnMenu(gc, anchorEl); },
            /** Close the column menu, if one is open. */
            closeColumnMenu() { closeColumnMenu(); },
            /** Open the filter popover of a column, by field, anchored to this element. An unknown field opens nothing. */
            openFilterPopover(field: string, anchorEl: HTMLElement) {
                const col = gc.grid?.columns.peek().find((c: any) => c.field === field);
                if (col) openFilterPopover(gc, col, anchorEl);
            },
            /** Close the filter popover, if one is open. */
            closeFilterPopover() { closeFilterPopover(); },
            /** Open the add-a-filter popover anchored to this element. */
            openAddFilter(anchorEl: HTMLElement) { openAddFilterPopover(gc, anchorEl); },
            /** Drop every filter: the ones set in the popovers and the ones on the source. */
            clearAllFilters() {
                for (const key of Object.keys(gc.popoverFilters)) delete gc.popoverFilters[key];
                gc.grid?.source.setFilter([]);
            },
            /** Open or close the detail row under this row id. */
            toggleRowDetail(id: unknown) { toggleRowDetailFn(gc, id); gc.forceUpdate(); },
            // Edit API
            /** Begin an edit: one cell when a field is given, otherwise the whole row — in a dialog or inline, as `edit-mode` says. */
            startEdit(rowId: unknown, field?: string) {
                if (field) { const row = gc.grid?.source.getById(rowId) as any; if (row) { (gc as any).editingCell = { rowId, field, originalValue: row[field] }; gc.forceUpdate(); } }
                else if (gc.editMode() === 'dialog') openEditDialog(gc, rowId);
                else startRowEditFn(gc, rowId);
            },
            /** Abandon the edit in progress and discard what was typed. */
            cancelEdit() { gc.editingCell = null; gc.editingRowId = null; gc.editForm?.dispose(); gc.editForm = null; gc.forceUpdate(); },
            /** Append an empty row, with a negative id until it is saved, and start editing it in dialog and row modes. */
            addRow() { addRowFn(gc); },
            /** Delete a row by id and emit `pdx-row-delete`. It asks nothing first, and in batch mode does not sync. */
            deleteRow(rowId: unknown) { deleteRowFn(gc, rowId); },
            /** Uncheck every selected row. */
            clearSelection() { clearSelection(gc); },
            /** The ids currently checked, as an array. */
            getSelectedIds() { return Array.from(gc.selectedIds); },
            /** Check exactly these rows and uncheck the rest — what a partly refused bulk action leaves behind. */
            setSelectedIds(ids: unknown[]) { setSelection(gc, ids ?? []); },
            /**
             * Put an arrangement back — filter, sort, column order, widths, visibility, page size
             * — and show it.
             *
             * `grid.loadState()` is the same thing without the repaint: an application that
             * reaches for it gets a grid whose model has moved and whose header has not. It raises
             * no column event either, and that is deliberate: restoring a saved view is not a
             * reader rearranging anything.
             */
            applyState(state: Partial<GridState>) { gc.grid?.loadState(state); gc.forceUpdate(); },
            /** Send every change a batch edit is holding, then sync the source. */
            commitBatch() { commitBatch(gc); },
            /** Throw away every change a batch edit is holding. */
            revertBatch() { revertBatch(gc); },
        });
        // core's onDestroy: `ctx.onDestroy` does not exist, and an optional call on a cast would
        // hide that none of this ever runs.
        onDestroy(() => {
            stopModality();
            gridEffect?.();
            virtualState?.dispose();
            (gc.grid as any)?.dispose?.();
        });

        return {};
    },
    render: () => html``,
});
