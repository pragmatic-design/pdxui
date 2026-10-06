// Shared context passed to all grid sub-modules.
// Avoids circular deps — each module imports only this interface.

import type { SlotFunction } from '@pdxui/core';
import type { ResolvedColumn } from '@pdxui/core';
import type { Form } from '@pdxui/core';
import type { EditCellState } from './grid-edit';

export type AnyColumn = ResolvedColumn<any>;

export interface GridContext {
    /** useDataGrid composable (null before first build). */
    grid: { sort: Function; resize: Function; reorder: Function; toggleColumn: Function; saveState: Function; loadState: Function; source: any; sortState: any; rows: any; columns: any; total: any; page: any; totalPages: any; isLoading: any } | null;
    /** Get a named slot function (lazy — populated after setup). */
    getSlot: (name: string) => SlotFunction | undefined;
    /** Current selection mode: 'none' | 'single' | 'multiple'. */
    getSelectionMode: () => string;
    /**
     * A class for the whole ROW, from the row and its index — invalid, new, stale, over budget.
     *
     * `cellClass` alone cannot mark a row: it would mean repeating the same function on every
     * column, and the result would be a set of marked CELLS rather than a marked row.
     */
    getRowClass: (row: Record<string, unknown>, index: number) => string;
    /** ID field name. */
    getIdField: () => string;
    /** Selected row IDs (mutable Set, shared across modules). */
    selectedIds: Set<unknown>;
    /** This instance's header element (avoids document.querySelector picking the wrong grid). */
    getHeaderEl?: () => HTMLElement | null;
    /** This instance's body element (avoids document.querySelector picking the wrong grid). */
    getBodyEl?: () => HTMLElement | null;
    /** Emit a custom event from the component. */
    emit: (name: string, detail: unknown) => void;
    /** Whether the inline filter row is active (don't show filter icon in header). */
    hasFilterRow: () => boolean;
    /** Whether the toolbar is visible (hides badge/chooser from header). */
    hasToolbar: () => boolean;
    /** Whether the toolbar carries the quick search field (the `search` attribute). */
    hasSearch: () => boolean;
    /** The rows-per-page choices the footer's pager offers (the `pageSizes` prop); empty for none. */
    pageSizes: () => number[];
    /** Current filter mode: 'none' | 'row' | 'toolbar'. */
    filterMode: () => string;
    /** Callback to force full grid re-render (used by column menu, etc). */
    forceUpdate: () => void;
    /** Per-grid popover filter state (operator + value per column). */
    popoverFilters: Record<string, { op1: string; val1: string; logic: 'and' | 'or'; op2: string; val2: string }>;
    /** Per-grid inline filter values. */
    inlineFilterValues: Record<string, unknown>;
    /** Per-grid inline filter operators (selected by user in filter row dropdown). */
    inlineFilterOps: Record<string, string>;
    /** Whether row detail expansion is enabled. */
    isExpandable: () => boolean;
    /** Whether drag-to-reorder of rows is enabled (non-virtual grids). */
    isRowReorder: () => boolean;
    /** Set of expanded row IDs (mutable). */
    expandedRows: Set<unknown>;
    /** Per-instance collapsed group state (field::value keys). */
    collapsedGroups: Set<string>;
    /** Current edit mode. */
    editMode: () => string;
    /** Cell currently being edited (cell mode). */
    editingCell: EditCellState | null;
    /** Row ID currently in row-edit mode. */
    editingRowId: unknown | null;
    /** Form instance for row/dialog edit. */
    editForm: Form<Record<string, unknown>> | null;
    /** Batch mode: accumulated changes per row. */
    batchChanges: Map<unknown, Record<string, unknown>>;
    /** The grid's accessible name (the `label` prop). */
    getLabel?: () => string;
    /** Where the roving tab stop is: the row (by identity), its place, and the column the vertical
     *  moves keep; `pending` while a key move is focusing its target (grid-a11y). */
    nav: { key: string; index: number; col: number; pending?: boolean } | null;
    /** Whether a cell of the grid had focus, so a rebuild puts it back. */
    navFocused: boolean;
    /** Called after every body render — the virtual window included — to re-apply ARIA and the tab stop. */
    afterRender?: () => void;
}

/** Marks a cell's single control (a checkbox, a sort button, a toggle): it takes the cell's roving
 *  tab stop, so Enter and Space act on it natively (grid-a11y). */
export const GRID_WIDGET = 'data-dg-widget';
/** Marks a row the arrows pass over: the filter row, whose inputs keep their own tab stops. */
export const NAV_SKIP = 'data-dg-nav-skip';

// A command column (`command: true`: row actions) has nothing to filter, resize, reorder or hide, as
// ColumnDef says. Sort reads it in core (data-grid.ts); these guards cover the rest, or the entity
// grid's actions column would get a filter button, a resize handle, a drag, and a checkbox in the
// column chooser.
/** Whether the column offers a filter (header funnel, filter row, toolbar "add filter"). */
export const canFilter = (col: AnyColumn): boolean => col.def.filterable !== false && !col.def.command;
/** Whether the column can be resized by its header handle. */
export const canResize = (col: AnyColumn): boolean => col.def.resizable !== false && !col.def.command;
/** Whether the column can be dragged to a new place. */
export const canReorder = (col: AnyColumn): boolean => col.def.reorderable !== false && !col.def.command;

/** Apply consistent column sizing (flex or fixed width) + frozen positioning. */
export function applyColSize(el: HTMLElement, col: AnyColumn): void {
    if (col.flex > 0) {
        el.style.flex = `${col.flex} 1 ${col.width}px`;
        el.style.minWidth = `${col.minWidth}px`;
        el.style.maxWidth = col.maxWidth < 9999 ? `${col.maxWidth}px` : '';
    } else {
        el.style.width = `${col.width}px`;
        el.style.minWidth = `${col.minWidth}px`;
        el.style.flexShrink = '0';
    }
    // Frozen columns — sticky positioning
    if (col.frozen === 'left') el.classList.add('pdx-dg-frozen-left');
    else if (col.frozen === 'right') el.classList.add('pdx-dg-frozen-right');
}
