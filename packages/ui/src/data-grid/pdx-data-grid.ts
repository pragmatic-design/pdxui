// pdx-data-grid — Enterprise data grid component.
// Architecture: shell component that delegates to focused sub-modules.
// DataSource is mandatory — arrays are auto-wrapped.
//
// Sub-modules:
//   grid-context.ts  — shared context + applyColSize
//   grid-header.ts   — header row, sort carets, resize handles
//   grid-body.ts     — row rendering, cell formatting
//   grid-delegate.ts — the body's events, one listener per type for every row
//   grid-filter.ts   — inline filter row
//   grid-selection.ts — checkbox, select-all, range
//   grid-footer.ts   — pdx-pagination integration

import { component, html, useDataGrid, isDataSource, createDataSource, effect, onDestroy, onMount, DEV, slot, prop } from '@pdxui/core';
import type { DataSource, ColumnDef, Dispose, GridState } from '@pdxui/core';
import type { GridContext, AnyColumn } from './grid-context';
import { buildHeader } from './grid-header';
import { renderRows } from './grid-body';
import { bindBody } from './grid-delegate';
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
import { t, gridStringsChanged } from './grid-i18n'; // also registers the default strings
import { defineIcons } from '../icon/icon-map';
import iconInbox from '../icon/pragmatic/inbox';

// Runtime sub-components created via document.createElement (toolbar/filter/edit/footer).
// Imported here so the data-grid self-registers its dependencies in any consumer,
// regardless of whether the host template references these tags statically.
import '../button/pdx-button';
/** `pdx-icon` the first time the empty state shows: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}
// The editors, the filter controls and the edit dialog are created only when someone edits or
// filters: they load then (shared/lazy-tags.ts), or when the browser is idle in a grid that can.
import { prefetchTags } from '../shared/lazy-tags';
import '../pagination/pdx-pagination';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/data-grid';
// `pdx-spinner` is imported where the loading overlay SHOWS (`showLoading`), as `pdx-list` does: it
// draws from a stylesheet of its own (#821), and a static import put that stylesheet in the first wave
// of every page with a grid, where the route waited for it (#963, #969).

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

/** Whether a node shows anything: an element, or text that is not only whitespace. Comments do not. */
function showsSomething(node: Node): boolean {
    if (node.nodeType === Node.ELEMENT_NODE) return true;
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').trim() !== '';
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return [...node.childNodes].some(showsSomething);
    return false;
}

/**
 * What a snippet drew, or null when it drew nothing (#597). One `cell(row, column)` snippet serves
 * every column, and a page's `@if (column.field === 'price') { … }` renders an empty fragment for the
 * others — those columns are the grid's to draw, as if no snippet had been given.
 */
function drawn(node: Node | null | undefined): Node | null {
    return node && showsSomething(node) ? node : null;
}

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
 *
 * @slot cell - Draws a cell, one snippet for every column: `cell(row, column, value)`, switching on `column.field`. A column it draws nothing for (no element, no text) is drawn by the grid, so a page writes only the columns it changes.
 * @slot header - Draws a column's header: `header(column)`; a column it draws nothing for keeps its title.
 * @slot detail - Draws an expanded row's detail: `detail(row)`.
 * @slot editCell - Draws the editor of the cell being edited: `editCell(row, column, value, form)`, switching on `column.field`; a column it draws nothing for gets the grid's editor. Enter, Tab and a click outside commit the value of its first control. `form` is null in a cell edit.
 * @slot filter - Draws a column's cell in the filter row: `filter(column)`; a column it draws nothing for keeps the grid's input.
 * @slot filterPopover - Draws a column's filter popover: `filterPopover(column, apply, clear)`. `apply()` applies the grid's filters and closes it, `clear()` drops this column's filter and closes it. A column it draws nothing for gets the grid's popover.
 * @slot toolbarStart - Draws at the start of the toolbar, after Reload: `toolbarStart(grid)`.
 * @slot toolbarEnd - Draws at the end of the toolbar, after the spacer: `toolbarEnd(grid)`.
 * @slot empty - Draws the empty state in place of the grid's icon and title: `empty()`.
 *
 * @cssstate striped - `striped`: every other row is tinted.
 * @cssstate hover - `hover`: a row under the pointer is highlighted.
 * @cssstate row-clickable - `row-clickable`: the rows open something, and take a pointer.
 * @cssstate compact - `compact`: tighter cells.
 * @cssstate sticky-header - `sticky-header`: the header stays while the body scrolls.
 * @cssstate fill-height - `fill-height`: the grid fills its parent's height and only its body scrolls.
 * @cssstate loading - The source is pending; the grid is `aria-busy` meanwhile.
 * @cssstate empty - The source has settled with no row; the empty status says so.
 * @cssstate editing - A cell or a row is being edited.
 *
 * @csspart toolbar - The toolbar, with `show-toolbar`.
 * @csspart group-bar - The group bar, with `show-group-bar`.
 * @csspart grid - The scroll area that is the `role="grid"`: header, filter row, body, summary.
 * @csspart header - The header row group.
 * @csspart column-header - A column's header cell.
 * @csspart filter-row - The inline filter row, with `filter-mode="row"`.
 * @csspart body - The rows' group.
 * @csspart row - A data row.
 * @csspart cell - A data cell.
 * @csspart summary - The summary row, when a column declares an aggregate.
 * @csspart footer - The footer and its pager; above the grid too with `pagination-position`.
 * @csspart empty - The empty status, while the source has settled with no row.
 * @csspart loading - The loading overlay, while the source is pending.
 *
 * @capability sortable - A column declared `sortable` sorts on its header; the header carries `aria-sort`.
 * @capability filterable - The rows filter, with `filterable`: by column, in a row, a popover or the toolbar (`filter-mode`).
 * @capability selectable - Rows are checked, one or many, with `selection="single"` or `"multiple"`.
 * @capability editable - Cells or rows are edited in place or in a dialog, with `editable` and `edit-mode`.
 */
component('pdx-data-grid', {
    props: {
        source: prop<Record<string, unknown> | null>(null),
        columns: prop<unknown[] | null>(null, { type: Array }),
        data: prop<unknown[] | null>(null, { type: Array }),
        striped: prop(false),
        hover: prop(true),
        /**
         * The rows open something: a click on a row is handled (`pdx-row-click`), so the row takes
         * a pointer, so a page does not write its own `.pdx-dg-row { cursor: pointer }`, reaching into
         * this component's internal class. Enter on a row is unchanged: it edits a cell in an
         * editable grid and does nothing otherwise, so give a keyboard reader a way in of its own
         * (an `actions()` column).
         */
        rowClickable: prop(false),
        compact: prop(false),
        stickyHeader: prop(true),
        selection: prop('none'),
        /**
         * A class for the whole row: a string, or `(row, index) => string`. Marks a row invalid,
         * new, stale — what `cellClass` could only do one column at a time.
         *
         * Declared `String` because an ATTRIBUTE is one (`row-class="compact"`), and `PropType` is
         * a single constructor. A function assigned as a JS property arrives untouched: `coerce`
         * returns a non-string value as it is (`component.ts:448`).
         */
        rowClass: prop(''),
        idField: prop('id'),
        stateKey: prop(''),
        /** The empty state's text. Unset, it is the grid string `empty.title`. */
        emptyTitle: prop(''),
        emptyIcon: prop('inbox', { iconName: true }),
        showFooter: prop(true),
        filterable: prop(false),
        filterMode: prop('none'),
        showToolbar: prop(false),
        /** A search field at the toolbar's right: the term is looked for in the columns marked `searchable`. */
        search: prop(false),
        showGroupBar: prop(false),
        paginationPosition: prop('bottom'),
        /** The rows-per-page choices the footer's pager offers; empty, it offers none. */
        pageSizes: prop<unknown[]>([]),
        expandable: prop(false),
        rowReorder: prop(false),
        groupBy: prop<unknown[] | null>(null, { type: Array }),
        virtualScroll: prop(false),
        /** Row height in px for virtual scrolling (42 when unset); ignored otherwise. */
        rowHeight: prop(0),
        /** Caps the grid height in px; the body scrolls beyond it. 0 = no cap (a virtual grid uses 400). */
        maxHeight: prop(0),
        /** Fill the parent's height (flex) instead of growing with content. The page no longer
         *  scrolls — only the grid body scrolls (virtualized). Pair with virtual-scroll for large sets. */
        fillHeight: prop(false),
        editable: prop(false),
        editMode: prop('cell'),
        /** The grid's accessible name (its aria-label). */
        label: prop(''),
    },
    // A parent's `@snippet` sets these (#597): one `cell` and one `header` for every column, rather
    // than a slot per column, since a snippet's name is an identifier and `cell:price` is not one.
    // The value is passed because the row does not hold it for a computed column, nor for a batch
    // edit not yet saved.
    // The row a snippet receives is the app's, an element of `data` (#651) or of `source` (#853): the
    // editor infers `T`.
    generics: { T: { from: 'data', source: 'source' } },
    slots: {
        cell: slot<(row: T, column: { field: string; header?: string; type?: string; command?: boolean; [key: string]: unknown }, value: unknown) => Node>(),
        header: slot<(column: { field: string; header?: string; type?: string; command?: boolean; [key: string]: unknown }) => Node>(),
        detail: slot<(row: T) => Node>(),
        // #673: the grid's other templates, with their context as arguments. `form` is the grid's
        // edit form, which only a row edit has: a cell edit passes null.
        editCell: slot<(row: T, column: { field: string; header?: string; type?: string; command?: boolean; [key: string]: unknown }, value: unknown, form: import('@pdxui/core').Form<Record<string, unknown>> | null) => Node>(),
        filter: slot<(column: { field: string; header?: string; type?: string; command?: boolean; [key: string]: unknown }) => Node>(),
        filterPopover: slot<(column: { field: string; header?: string; type?: string; command?: boolean; [key: string]: unknown }, apply: () => void, clear: () => void) => Node>(),
        toolbarStart: slot<(grid: import('@pdxui/core').DataGrid<Record<string, unknown>>) => Node>(),
        toolbarEnd: slot<(grid: import('@pdxui/core').DataGrid<Record<string, unknown>>) => Node>(),
        empty: slot<() => Node>(),
    },
    // Its looks and its conditions are states of the host (#132): the design CSS selects them; the
    // wrapper inside carries no class for them.
    states: ['striped', 'hover', 'row-clickable', 'compact', 'sticky-header', 'fill-height', 'loading', 'empty', 'editing'],
    parts: ['toolbar', 'group-bar', 'grid', 'header', 'column-header', 'filter-row', 'body', 'row', 'cell', 'summary', 'footer', 'empty', 'loading'],
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

        /**
         * Show or hide the loading overlay; the first time it is still shown a frame later, load
         * `pdx-spinner`. A grid over `data` reads it through a promise, so it is loading for a microtask
         * as it mounts: an overlay never painted has no spinner to draw, and a grid at rest would have
         * fetched the spinner and its stylesheet every time.
         */
        function showLoading(loading: boolean): void {
            if (!loadingEl) return;
            loadingEl.style.display = loading ? '' : 'none';
            if (!loading || customElements.get('pdx-spinner')) return;
            // Its element is in the overlay already; it upgrades when its module lands. The source is
            // asked, not the overlay: the grid writes the overlay in a frame of its own, which may come
            // after this one.
            requestAnimationFrame(() => {
                if (gc.grid?.isLoading.peek() && !customElements.get('pdx-spinner')) void import('../spinner/pdx-spinner');
            });
        }

        /**
         * Show or hide the empty state; the first time it shows its icon, load `pdx-icon`. It is a
         * `role="status"`, which carries its text only while it has something to say (A4): its content
         * is put in when it shows and taken out when it hides.
         */
        function showEmpty(show: boolean): void {
            if (!emptyEl) return;
            emptyEl.style.display = show ? '' : 'none';
            if (!show) { emptyEl.replaceChildren(); return; }
            if (!emptyEl.hasChildNodes()) fillEmptyState(emptyEl);
            if (emptyEl.querySelector('pdx-icon')) loadIcon();
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
        /**
         * The parent's snippet for `name` (#597), when it gave one: the element's declared slot property.
         * The alpha scoped slots (`col:{field}`, `header:{field}`, …) are not read (#492).
         */
        const snippetOf = (name: 'cell' | 'header' | 'detail' | 'editCell' | 'filter' | 'filterPopover' | 'toolbarStart' | 'toolbarEnd' | 'empty') => {
            const fn = (ctx as unknown as Record<string, () => unknown>)[name]?.();
            return typeof fn === 'function' ? fn as (...args: unknown[]) => Node | null | undefined : null;
        };
        const gc: GridContext = {
            grid: null,
            customCell: (row, col, value) => drawn(snippetOf('cell')?.(row, col.def, value)) ?? null,
            customHeader: (col) => drawn(snippetOf('header')?.(col.def)) ?? null,
            customDetail: (row) => drawn(snippetOf('detail')?.(row)) ?? null,
            customEditCell: (row, col, value) => drawn(snippetOf('editCell')?.(row, col.def, value, gc.editForm)) ?? null,
            customFilter: (col) => drawn(snippetOf('filter')?.(col.def)) ?? null,
            customFilterPopover: (col) => {
                const snippet = snippetOf('filterPopover');
                if (!snippet) return null;
                return (apply, clear) => drawn(snippet(col.def, apply, clear)) ?? null;
            },
            customToolbar: (side) => drawn(snippetOf(side === 'start' ? 'toolbarStart' : 'toolbarEnd')?.(gc.grid)) ?? null,
            customEmpty: () => drawn(snippetOf('empty')?.()) ?? null,
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

        /**
         * Counts, indices, selection state and the roving tab stop, after any render; and the
         * conditions the host shows: pending (A4: the grid is `aria-busy` while its source is, and not
         * once it has settled), empty, editing.
         */
        function refreshA11y(): void {
            if (!gridEl) return;
            applyGridAria(gc, gridEl);
            applyRoving(gc, gridEl);
            const pending = !!gc.grid?.isLoading.peek();
            if (pending) gridEl.setAttribute('aria-busy', 'true');
            else gridEl.removeAttribute('aria-busy');
            ctx.state('loading', pending);
            ctx.state('empty', !pending && (gc.grid?.rows.peek().length ?? 0) === 0);
            ctx.state('editing', gc.editingCell != null || gc.editingRowId != null);
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

        // A lone modifier held for the next click draws no focus ring. Listened for once mounted: the
        // keys are the document's, and a grid written by the server (#160) has none.
        let stopModality = (): void => {};
        onMount(() => { stopModality = trackInputModality(ctx.el); });

        // Internal event routing (from sub-modules): the host's listeners, declared in `host` below.
        /** A group opened or closed, or a detail row: the body is drawn again. */
        function redrawBody(): void {
            if (bodyEl && gc.grid) {
                renderBody(gc.grid.rows.peek(), gc.grid.columns.peek());
                refreshA11y();
            }
        }
        const routed = {
            onSelectAll: () => selectAll(gc),
            onToggleSelect: (e: Event) => {
                const { id, shiftKey } = (e as CustomEvent<{ id: unknown; shiftKey: boolean }>).detail;
                toggleSelect(gc, id, shiftKey);
            },
            onGroupToggle: () => redrawBody(),
            onToggleDetail: (e: Event) => {
                toggleRowDetailFn(gc, (e as CustomEvent<{ id: unknown }>).detail.id);
                redrawBody();
            },
        };

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
            // Its looks are states of the host (the track above), not classes here.
            wrap.className = 'pdx-dg';
            if (ctx.fillHeight()) {
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
            scrollEl.dataset.part = 'grid';
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
            bodyEl.dataset.part = 'body';
            bodyEl.setAttribute('role', 'rowgroup');
            // One listener per event type for every row (grid-delegate.ts).
            bindBody(gc, bodyEl);

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
            loadingEl.dataset.part = 'loading';
            loadingEl.innerHTML = '<pdx-spinner size="24"></pdx-spinner>';
            showLoading(loading);
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
                // rebuilds the header and the rows, which is where the names are. The grid's own
                // strings only: another component's arriving is no reason to rebuild (#407).
                gridStringsChanged();
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
                    showLoading(newLoading);
                    if (footerEl) updateFooter(gc, footerEl);
                    if (footerTopEl) updateFooter(gc, footerTopEl);
                    if (toolbarEl) updateToolbar(gc, toolbarEl);
                    if (groupBarEl) updateGroupBar(gc, groupBarEl);
                    refreshA11y();
                });
            });
        }

        // ─── Empty state ─────────────────────────────
        /** The empty status, built empty: `showEmpty` fills it when it shows. */
        function buildEmptyState(): HTMLElement {
            const el = document.createElement('div');
            el.className = 'pdx-dg-empty';
            el.dataset.part = 'empty';
            // A status: "No data" is what a filter that matches nothing has to say.
            el.setAttribute('role', 'status');
            return el;
        }

        /** What the empty status says: the page's `empty` snippet or slot, or an icon and the empty title. */
        function fillEmptyState(el: HTMLElement): void {
            const custom = gc.customEmpty();
            if (custom) {
                el.appendChild(custom);
                return;
            }
            const icon = document.createElement('div');
            icon.className = 'pdx-dg-empty-icon';
            // Built with the grid and hidden while it has rows: `pdx-icon` is loaded when it SHOWS.
            // Its default icon is in the grid's chunk: an empty grid is what a page shows while its
            // rows load, and loaded on demand it cost a request after the route had arrived (#47).
            defineIcons({ inbox: iconInbox });
            const pdxIcon = document.createElement('pdx-icon');
            pdxIcon.setAttribute('name', (ctx.emptyIcon() as string) || 'inbox');
            pdxIcon.setAttribute('size', '40');
            icon.appendChild(pdxIcon);
            el.appendChild(icon);
            const txt = document.createElement('div');
            txt.className = 'pdx-dg-empty-text';
            txt.textContent = (ctx.emptyTitle() as string) || t('empty.title');
            el.appendChild(txt);
        }

        // ─── Its looks, as states of the host ────────
        // Set here and not in the build: a state is the host's, and changing one restyles the grid
        // without rebuilding it.
        ctx.track(() => {
            ctx.state('striped', !!ctx.striped());
            ctx.state('hover', !!ctx.hover());
            ctx.state('row-clickable', !!ctx.rowClickable());
            ctx.state('compact', !!ctx.compact());
            ctx.state('sticky-header', !!ctx.stickyHeader());
            ctx.state('fill-height', !!ctx.fillHeight());
        });

        // ─── Track prop changes ──────────────────────
        ctx.track(() => {
            void ctx.source();
            void ctx.columns();
            void ctx.data();
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
                // A grid that edits or filters will create its editors: have them before the
                // first double-click or filter asks, without holding up the first screen.
                if (ctx.editable() || resolveFilterMode() !== 'none') {
                    prefetchTags(['pdx-input', 'pdx-number-input', 'pdx-select', 'pdx-date-picker', 'pdx-form-field', 'pdx-dialog']);
                }
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

        return routed;
    },
    // The sub-modules talk to the grid through events on its host (#133).
    host: {
        '@__select-all': (ctx) => ctx.onSelectAll(),
        '@__toggle-select': (ctx, e) => ctx.onToggleSelect(e),
        '@__group-toggle': (ctx) => ctx.onGroupToggle(),
        '@__toggle-detail': (ctx, e) => ctx.onToggleDetail(e),
    },
    render: () => html``,
});

/** The row a snippet receives, the app's (#651): the editor infers it from `:data` or `:source`. */
type T = unknown;
