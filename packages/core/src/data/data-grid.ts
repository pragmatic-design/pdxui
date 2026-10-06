// useDataGrid — Headless composable for enterprise data grids.
// Bridges DataSource, column resolution, sort state, and selection.
// Zero DOM — produces reactive signals consumed by <pdx-data-grid> or custom renderers.

import { signal, computed, batch } from '../reactivity/signal';
import type { ReadonlySignal, Signal } from '../utils/types';
import type { DataSource } from './data-source';
import type { SortDescriptor } from './transport';
import { createDataSource, isDataSource } from './data-source';
import type {
    ColumnDef, ResolvedColumn, DataGridOptions, GridState, ColumnChange,
    ColumnType,
} from './data-grid-types';
import { humanizeField, defaultAlign } from './data-grid-types';

// ─── Return type ─────────────────────────────────────────────

export interface DataGrid<T = unknown> {
    /** DataSource bound to this grid. */
    source: DataSource<T>;
    /** Resolved columns with current widths, sort state, visibility. */
    columns: ReadonlySignal<ResolvedColumn<T>[]>;
    /** Visible data rows (from DataSource). */
    rows: ReadonlySignal<T[]>;
    /** Current sort descriptors. */
    sortState: ReadonlySignal<SortDescriptor[]>;
    /** Total row count (server-side). */
    total: ReadonlySignal<number>;
    /** Current page (1-based). */
    page: ReadonlySignal<number>;
    /** Total pages. */
    totalPages: ReadonlySignal<number>;
    /** Loading state. */
    isLoading: ReadonlySignal<boolean>;

    // ─── Actions ──────────────────────────────────
    /** Sort by field. Toggles direction if already sorted. Shift = multi-sort. */
    sort(field: string, dir?: 'asc' | 'desc', append?: boolean): void;
    /** Clear all sort. */
    clearSort(): void;
    /** Go to page. */
    setPage(page: number): void;
    /** Resize a column. */
    resize(field: string, width: number): void;
    /** Reorder a column (move fromField before toField). */
    reorder(fromField: string, toField: string): void;
    /** Toggle column visibility. */
    toggleColumn(field: string): void;

    // ─── State persistence ────────────────────────
    saveState(): GridState;
    loadState(state: Partial<GridState>): void;

    /** Cleanup. */
    dispose(): void;
}

// ─── Default column width ────────────────────────────────────

const DEFAULT_WIDTH = 150;
const DEFAULT_MIN_WIDTH = 60;
const DEFAULT_MAX_WIDTH = 9999;

// ─── Factory ─────────────────────────────────────────────────

/**
 * Everything a data grid needs that is not markup: column state (width, order, visibility), sorting,
 * selection, editing and the {@link createDataSource} underneath.
 *
 * Headless on purpose — it owns the state and the rules, `<pdx-data-grid>` owns the DOM — so the
 * same behaviour is testable without rendering and reusable by a component that looks nothing like a
 * table.
 *
 * Column GROUPS render as a multi-row header, but sorting, widths and order operate on the flat leaf
 * list; the grid flattens them for you and keeps the parent on each leaf. Two levels, no more.
 */
export function useDataGrid<T extends Record<string, unknown>>(
    options: DataGridOptions<T>,
): DataGrid<T> {
    // Resolve DataSource
    const ds: DataSource<T> = isDataSource(options.source)
        ? options.source as DataSource<T>
        : createDataSource<T>({ data: options.source as T[] });

    // ─── Flatten column groups → leaves (BUG 7) ──────────────
    // Column groups (`children`) render as a multi-row header, but body / sort / width / order all
    // operate on the flat leaf list. Each leaf carries its parent group id + header (null for a
    // top-level column → identical single-row header rendering). Only 2 levels are supported.
    const leaves = flattenColumns(options.columns);
    const leafByField = new Map<string, Leaf<T>>();
    for (const l of leaves) leafByField.set(l.field, l);

    // ─── Column order signal (for reorder/hide) ──────────────
    const _columnOrder: Signal<string[]> = signal(leaves.map(l => l.field));
    const _columnWidths: Signal<Record<string, number>> = signal(
        buildInitialWidths(leaves),
    );
    const _columnVisibility: Signal<Record<string, boolean>> = signal(
        buildInitialVisibility(leaves),
    );

    // ─── Resolved columns (reactive) ─────────────────────────
    const columns = computed<ResolvedColumn<T>[]>(() => {
        const order = _columnOrder();
        const widths = _columnWidths();
        const visibility = _columnVisibility();
        const sortDescs = ds.sort();

        // Build sort lookup: field → { dir, index }
        const sortMap = new Map<string, { dir: 'asc' | 'desc'; index: number }>();
        sortDescs.forEach((s, i) => sortMap.set(s.field, { dir: s.dir, index: i }));

        const resolved = order
            .map(field => {
                const leaf = leafByField.get(field);
                if (!leaf) return null;
                const def = leaf.def;

                const type = def.type ?? inferType(def);
                const sortInfo = sortMap.get(field);
                const vis = visibility[field] ?? !def.hidden;

                // Smart sizing: type-aware defaults when no explicit width
                const hasExplicitWidth = !!(widths[field] || def.width);
                const typeWidth = defaultWidthForType(type);
                const effectiveWidth = widths[field] ?? def.width ?? typeWidth.width;

                // flex: text columns without explicit width → flex:1 (fill space)
                // typed columns (boolean, number, date) → flex:0 (fixed)
                const flexVal = def.flex ?? (hasExplicitWidth ? 0 : typeWidth.flex);

                // Sortable columns need more minWidth for header text + carets
                const isSortable = def.sortable !== false;
                const typeMinWidth = typeWidth.minWidth ?? DEFAULT_MIN_WIDTH;
                const effectiveMinWidth = def.minWidth ?? (isSortable ? Math.max(typeMinWidth, 70) : typeMinWidth);

                // Command columns auto-disable interactive features
                const isCommand = !!def.command;

                return {
                    def,
                    field,
                    header: def.header ?? humanizeField(field),
                    type,
                    width: effectiveWidth,
                    minWidth: effectiveMinWidth,
                    maxWidth: def.maxWidth ?? DEFAULT_MAX_WIDTH,
                    align: def.align ?? defaultAlign(type),
                    sortable: isCommand ? false : def.sortable !== false,
                    sortDir: sortInfo?.dir ?? null,
                    sortIndex: sortInfo?.index ?? -1,
                    visible: vis,
                    frozen: def.frozen ?? null,
                    flex: flexVal,
                    group: leaf.groupHeader,
                    groupId: leaf.groupId,
                } satisfies ResolvedColumn<T>;
            })
            .filter(c => c !== null) as ResolvedColumn<T>[];

        // Fill 100% width: when all columns are fixed (flex=0), give each a proportional
        // flex-grow based on its width. This ensures columns fill the container when it's
        // wider than the sum of widths, while maintaining relative proportions.
        // When container is smaller, min-width prevents shrinking → horizontal scroll.
        const visible = resolved.filter(c => c.visible);
        if (visible.length > 0 && visible.every(c => c.flex === 0)) {
            for (const col of visible) {
                col.flex = col.width; // flex-grow proportional to width
            }
        }

        return resolved;
    });

    // ─── Proxy signals from DataSource ───────────────────────
    const rows = ds.data;
    const sortState = ds.sort;
    const total = ds.total;
    const page = ds.page;
    const totalPages = ds.totalPages;
    const isLoading = ds.isLoading;

    // ─── Sort action ─────────────────────────────────────────
    function sort(field: string, dir?: 'asc' | 'desc', append = false): void {
        const leaf = leafByField.get(field);
        if (!leaf || leaf.def.sortable === false) return;

        const current = ds.sort.peek();
        const existing = current.find(s => s.field === field);

        let newDir: 'asc' | 'desc';
        if (dir) {
            newDir = dir;
        } else if (existing) {
            // Toggle: asc → desc → remove
            if (existing.dir === 'asc') {
                newDir = 'desc';
            } else {
                // Remove this field from sort
                ds.setSort(current.filter(s => s.field !== field));
                return;
            }
        } else {
            newDir = 'asc';
        }

        const newSort: SortDescriptor = { field, dir: newDir };
        if (append) {
            // Multi-sort: replace existing for this field or append
            const updated = current.filter(s => s.field !== field);
            updated.push(newSort);
            ds.setSort(updated);
        } else {
            ds.setSort([newSort]);
        }
    }

    function clearSort(): void {
        ds.setSort([]);
    }

    function setPage(p: number): void {
        ds.setPage(p);
    }

    /** Tell the consumer what a reader just did — never what `loadState` did. */
    function announce(change: ColumnChange): void {
        options.onColumnChange?.(change);
    }

    // ─── Column resize ───────────────────────────────────────
    function resize(field: string, width: number): void {
        const leaf = leafByField.get(field);
        if (!leaf) return;
        const min = leaf.def.minWidth ?? DEFAULT_MIN_WIDTH;
        const max = leaf.def.maxWidth ?? DEFAULT_MAX_WIDTH;
        // CLAMPED, and that is what is reported: an application that wrote down the width it asked
        // for would keep a number the grid never used.
        const clamped = Math.max(min, Math.min(max, width));
        if (_columnWidths.peek()[field] === clamped) return;
        _columnWidths.set(prev => ({ ...prev, [field]: clamped }));
        announce({ kind: 'resize', field, width: clamped, columnWidths: { ..._columnWidths.peek() } });
    }

    // ─── Column reorder ──────────────────────────────────────
    function reorder(fromField: string, toField: string): void {
        if (fromField === toField) return;
        // Column groups: only allow reordering leaves WITHIN the same group (keeps each group's
        // leaves contiguous so the multi-row header stays coherent). Cross-group moves are ignored.
        const from = leafByField.get(fromField);
        const to = leafByField.get(toField);
        if (from && to && from.groupId !== to.groupId) return;

        // Worked out BEFORE the set rather than inside the updater, so a move that changes nothing
        // — a field neither side knows — neither writes nor announces.
        const order = [..._columnOrder.peek()];
        const fromIdx = order.indexOf(fromField);
        const toIdx = order.indexOf(toField);
        if (fromIdx === -1 || toIdx === -1) return;
        order.splice(fromIdx, 1);
        order.splice(toIdx, 0, fromField);
        _columnOrder.set(order);
        announce({ kind: 'reorder', field: fromField, columnOrder: [...order] });
    }

    // ─── Column visibility ───────────────────────────────────
    function toggleColumn(field: string): void {
        const visible = !(_columnVisibility.peek()[field] ?? true);
        _columnVisibility.set(prev => ({ ...prev, [field]: visible }));
        announce({ kind: 'visibility', field, visible, columnVisibility: { ..._columnVisibility.peek() } });
    }

    // ─── State persistence ───────────────────────────────────
    function saveState(): GridState {
        return {
            columnOrder: _columnOrder.peek(),
            columnWidths: { ..._columnWidths.peek() },
            columnVisibility: { ..._columnVisibility.peek() },
            sort: [...ds.sort.peek()],
            filter: [...ds.filter.peek()],
            group: [...ds.group.peek()],
            pageSize: ds.pageSize.peek(),
        };
    }

    function loadState(state: Partial<GridState>): void {
        batch(() => {
            if (state.columnOrder) _columnOrder.set(state.columnOrder);
            if (state.columnWidths) _columnWidths.set(state.columnWidths);
            if (state.columnVisibility) _columnVisibility.set(state.columnVisibility);
            if (state.sort) ds.setSort(state.sort);
            if (state.filter) ds.setFilter(state.filter);
            if (state.group) ds.setGroup(state.group);
            if (state.pageSize) ds.setPageSize(state.pageSize);
        });
    }

    // Auto-persist
    if (options.stateKey) {
        const key = `pdx-grid-${options.stateKey}`;
        try {
            const saved = localStorage.getItem(key);
            if (saved) loadState(JSON.parse(saved));
        } catch { /* ignore corrupted state */ }
    }

    function dispose(): void {
        // Save state on dispose if stateKey is set
        if (options.stateKey) {
            try {
                localStorage.setItem(
                    `pdx-grid-${options.stateKey}`,
                    JSON.stringify(saveState()),
                );
            } catch { /* quota exceeded */ }
        }
    }

    return {
        source: ds,
        columns,
        rows,
        sortState,
        total,
        page,
        totalPages,
        isLoading,
        sort,
        clearSort,
        setPage,
        resize,
        reorder,
        toggleColumn,
        saveState,
        loadState,
        dispose,
    };
}

// ─── Internal helpers ────────────────────────────────────────

/** A flattened leaf column with its parent group metadata (BUG 7). */
interface Leaf<T> {
    /** Stable identity key (def.field, or a synthetic `__colN` when the def has no field). */
    field: string;
    def: ColumnDef<T>;
    /** Parent group id (null for top-level columns). */
    groupId: string | null;
    /** Parent group header text (null for top-level columns). */
    groupHeader: string | null;
}

/**
 * Flatten column groups (`children`) into leaf columns, tagging each leaf with its parent group.
 * Top-level columns (no `children`) get `groupId: null` → identical single-row header rendering.
 * Only 2 levels are supported; deeper nesting is flattened under the nearest declared group.
 */
function flattenColumns<T>(defs: ColumnDef<T>[]): Leaf<T>[] {
    const out: Leaf<T>[] = [];
    let groupSeq = 0;
    let autoSeq = 0;
    const fieldOf = (d: ColumnDef<T>): string => d.field || `__col${autoSeq++}`;
    for (const def of defs) {
        const children = def.children;
        if (children && children.length > 0) {
            const id = `__g${groupSeq++}`;
            const header = def.header ?? (def.field ? humanizeField(def.field) : '');
            for (const child of children) {
                // 2-level cap: a grandchild group is flattened under THIS group.
                if (child.children && child.children.length > 0) {
                    for (const gc of child.children) out.push({ field: fieldOf(gc), def: gc, groupId: id, groupHeader: header });
                } else {
                    out.push({ field: fieldOf(child), def: child, groupId: id, groupHeader: header });
                }
            }
        } else {
            out.push({ field: fieldOf(def), def, groupId: null, groupHeader: null });
        }
    }
    return out;
}

function buildInitialWidths<T>(leaves: Leaf<T>[]): Record<string, number> {
    const widths: Record<string, number> = {};
    for (const l of leaves) {
        if (l.def.width) widths[l.field] = l.def.width;
    }
    return widths;
}

function buildInitialVisibility<T>(leaves: Leaf<T>[]): Record<string, boolean> {
    const vis: Record<string, boolean> = {};
    for (const l of leaves) {
        if (l.def.hidden) vis[l.field] = false;
    }
    return vis;
}

function inferType<T>(col: ColumnDef<T>): ColumnType {
    if (col.compute) return 'text';
    const f = (col.field ?? '').toLowerCase();
    if (f.includes('date') || f.includes('created') || f.includes('updated') || f.endsWith('_at') || f.endsWith('At')) return 'date';
    if (f.includes('email')) return 'email';
    if (f.includes('price') || f.includes('amount') || f.includes('cost') || f.includes('total')) return 'currency';
    if (f.startsWith('is') || f.startsWith('has') || f.includes('active') || f.includes('enabled')) return 'boolean';
    return 'text';
}

/** Smart column defaults by type — avoids wasting space on boolean/number columns. */
function defaultWidthForType(type: ColumnType): { width: number; flex: number; minWidth?: number } {
    switch (type) {
        case 'boolean':  return { width: 100, flex: 0, minWidth: 70 };
        case 'number':   return { width: 110, flex: 0, minWidth: 80 };
        case 'currency': return { width: 130, flex: 0, minWidth: 100 };
        case 'date':     return { width: 130, flex: 0, minWidth: 100 };
        case 'email':    return { width: 200, flex: 1, minWidth: 120 };
        case 'enum':     return { width: 120, flex: 0, minWidth: 80 };
        case 'text':     return { width: DEFAULT_WIDTH, flex: 1 };
        default:         return { width: DEFAULT_WIDTH, flex: 1 };
    }
}
