// Data Grid types — ColumnDef, ResolvedColumn, GridState, EditMode.
// Shared between useDataGrid() composable and <pdx-data-grid> component.

import type { SortDescriptor, FilterDescriptor, CompositeFilter, FilterOperator } from './transport';
import type { GroupDescriptor } from './data-utils';
import type { ValidatorSchema, FormFieldType } from '../form/form-schema';

/** Filter option item (label + typed value). */
export interface FilterOptionItem { label: string; value: unknown; }
/** Async option loader for enum/lookup filters (server-side autocomplete). */
export type FilterOptionsLoader = (query: string) => Promise<FilterOptionItem[]>;

// ─── Column Definition (user-facing) ─────────────────────────

export interface ColumnDef<T = unknown> {
    /**
     * Data field path. Supports dotted notation: 'address.city'.
     *
     * Optional because a column GROUP is a header over `children` and has no field of its own;
     * `flattenColumns` gives such a column a generated key. Were it required, a column group could
     * not be written in TypeScript at all.
     */
    field?: string;
    /** Display name. Default: field humanized (camelCase → Title Case). */
    header?: string;

    // Sizing
    /** Fixed width in px. */
    width?: number;
    /** Minimum width in px. Default: 50. */
    minWidth?: number;
    /** Maximum width in px. Default: Infinity. */
    maxWidth?: number;
    /** Flex grow factor for remaining space distribution. */
    flex?: number;

    // Type — infers filter, sort, format, editor defaults
    type?: ColumnType;

    // Feature flags
    /** Allow sorting on this column. Default: true. */
    sortable?: boolean;
    /** Allow filtering on this column. Default: true. */
    filterable?: boolean;
    /** Allow resizing on this column. Default: true. */
    resizable?: boolean;
    /** Allow reordering on this column. Default: true. */
    reorderable?: boolean;
    /** Allow editing. Function for row-level control. Default: false. */
    editable?: boolean | ((row: T) => boolean);
    /** Validation rules for edit mode (required, min, email, etc.). */
    validators?: ValidatorSchema[];
    /** Override editor component type (default: inferred from column type). */
    editorType?: FormFieldType;
    /** Extra props for the editor component (e.g. min, max, step, options). */
    editorProps?: Record<string, unknown>;

    // Display
    /** Cell text alignment. Default: left (right for number/currency). */
    align?: 'left' | 'center' | 'right';
    /**
     * Value formatter — string pattern or function.
     * @deprecated A function that returns HTML is sanitized but fragile and not generator-friendly.
     * Prefer a typed `cell` renderer (badge/status/link/currency/date/booleanIcon/actions). Plain
     * (non-HTML) string formatters are still fine for simple text.
     */
    format?: string | ((value: unknown, row: T) => string);
    /**
     * A typed, SAFE cell renderer (preferred over `format` with raw HTML, and generator-friendly).
     * The grid builds the DOM safely (textContent), no innerHTML. E.g.: `cell: badge({ tones })`.
     */
    cell?: CellSpec;
    /** Cell CSS class — static or per-row function. */
    cellClass?: string | ((value: unknown, row: T) => string);

    // Filtering
    /** Limit available filter operators for this column. Default: all operators for the column type. */
    filterOperators?: FilterOperator[];
    /** Predefined filter values for enum columns — renders checkbox list instead of text input. */
    filterOptions?: { label: string; value: unknown }[];
    /** Enum/lookup filter: allow selecting multiple values (operator `in`/`notin`). */
    filterMultiple?: boolean;
    /** Enum/lookup filter: enable type-to-search in the value editor. */
    filterSearchable?: boolean;
    /** Enum/lookup filter: load options on demand (server-side autocomplete). */
    filterOptionsSource?: FilterOptionsLoader;
    /** Set/Excel filter: checklist of DISTINCT values derived from the data
     *  (search + select-all + (Blanks)). No need to author options. */
    filterSet?: boolean;
    /**
     * A filter the list is usually narrowed by: its chip is in the toolbar before any filter is
     * set, named by the column and empty until it is.
     */
    quickFilter?: boolean;
    /** Looked in by the grid's quick search (`search` on `pdx-data-grid`). */
    searchable?: boolean;
    /** Offered by the toolbar's «Group by» menu, and grouped by its `format`'s words. */
    groupable?: boolean;

    // Advanced
    /** Freeze column to left or right edge. */
    frozen?: 'left' | 'right';
    /** Hidden but available in column chooser. */
    hidden?: boolean;
    /** Footer aggregate function. */
    aggregate?: AggregateType | ((values: unknown[]) => unknown);

    /** Command column — auto-disables sort/filter/resize/reorder. Use with slot col:{field}. */
    command?: boolean;

    // Column groups (header spans children)
    children?: ColumnDef<T>[];

    // Computed column (client-side calculated field)
    compute?: (row: T) => unknown;
}

// ─── Typed cell renderers (safe, no raw HTML — preferred over a format string for the generator) ───

/** Row passed to cell-renderer callbacks. */
export type CellRow = Record<string, unknown>;

export interface CellBadgeSpec {
    kind: 'badge';
    /** Map valore→tono (success | info | warning | danger | muted | primary | …). */
    tones?: Record<string, string>;
    /** A fixed tone (it overrides the map). */
    tone?: string;
}

/** A status pill with a leading colour dot (like badge, but with an indicator). */
export interface CellStatusSpec {
    kind: 'status';
    /** Map value→tone driving the dot colour; falls back to 'muted'. */
    tones?: Record<string, string>;
    tone?: string;
}

/** Renders an anchor. `href`/`text` derive from the cell value + row. */
export interface CellLinkSpec {
    kind: 'link';
    href: (value: unknown, row: CellRow) => string;
    text?: (value: unknown, row: CellRow) => string;
    /** e.g. '_blank' (rel="noopener" is added automatically). */
    target?: string;
}

/** Intl currency formatting (configurable; the bare `currency` column type defaults to EUR). */
export interface CellCurrencySpec {
    kind: 'currency';
    /** ISO 4217 code, default 'EUR'. */
    currency?: string;
    locale?: string;
}

/** Intl date formatting. */
export interface CellDateSpec {
    kind: 'date';
    options?: Intl.DateTimeFormatOptions;
    locale?: string;
}

/** A truthy/falsy indicator (✓/✗ by default, or custom labels). */
export interface CellBooleanIconSpec {
    kind: 'boolean-icon';
    trueLabel?: string;
    falseLabel?: string;
}

/** One button in an `actions` cell. */
export interface CellAction {
    /** pdx-icon name (rendered as <pdx-icon name=…>). */
    icon?: string;
    /** The button's text, or its name when it has an icon. A function names it after its row —
     *  "Delete Alice Johnson", where a plain "Delete" on every row says nothing about which. */
    label?: string | ((row: CellRow) => string);
    tone?: string;
    onClick: (row: CellRow) => void;
}
/** A row of action buttons (e.g. edit/delete). Click does not bubble to row-click. */
export interface CellActionsSpec {
    kind: 'actions';
    actions: CellAction[];
}

/**
 * One entry of a `rowMenu` cell.
 *
 * It is either a LINK (`href`) or an ACTION (`onSelect`), and the difference is not cosmetic: a
 * "open in a new tab" that calls `window.open` cannot be middle-clicked, cannot be copied, and
 * announces itself as a button. An item with `href` renders as an `<a>` and the URL is sanitised
 * on the way in, like every other href the grid builds.
 */
export interface RowMenuItem {
    /** Stable key — what a test and a manifest select the item by. */
    key: string;
    /** The entry's text. A function names it after its row. */
    label: string | ((row: CellRow) => string);
    /** pdx-icon name, drawn before the label. */
    icon?: string;
    /** Destructive styling (delete, archive). */
    danger?: boolean;
    /** Makes the entry a link to this URL. */
    href?: (row: CellRow) => string;
    /** `_blank` and the like; `rel="noopener"` travels with it. */
    target?: string;
    /**
     * The entry exists and this caller may not use it. It stays on screen, marked `aria-disabled`,
     * and selecting it does nothing — the shape `pdx-bulk-actions` takes: an
     * action that merely vanishes is indistinguishable from one nobody wrote.
     */
    disabled?: boolean | ((row: CellRow) => boolean);
    /** Why, read out with the entry. Optional — `disabled` alone is legitimate. */
    disabledReason?: string;
    /** What it does to the row. Not needed by a link. */
    onSelect?: (row: CellRow) => void;
}
/** A single trigger that opens the row's own menu. */
export interface CellRowMenuSpec {
    kind: 'row-menu';
    items: RowMenuItem[];
    /** The trigger's and the menu's accessible name. A function names it after its row. */
    label?: string | ((row: CellRow) => string);
    /** The trigger's icon. Default `more-horizontal`. */
    icon?: string;
}

/** Extensible union of typed, SAFE cell renderers (DOM-built, never innerHTML of the value). */
export type CellSpec =
    | CellBadgeSpec
    | CellStatusSpec
    | CellLinkSpec
    | CellCurrencySpec
    | CellDateSpec
    | CellBooleanIconSpec
    | CellActionsSpec
    | CellRowMenuSpec;

// ─── Typed cell builders ───────────────────────────────────────────
//
// A column says `cell: badge({ tones: { Active: 'success' } })` and the grid builds the DOM for it.
// These return a SPEC, not markup: the value never reaches innerHTML, so a row that arrived from a
// server cannot inject anything. That is the whole reason they exist rather than a render callback
// returning an HTML string.

/**
 * Render the cell as a badge, with a tone chosen per value.
 *
 * `tones` maps the value to a tone name (`{ Active: 'success', Suspended: 'danger' }`); `tone` sets
 * one for every row. A value with no entry renders in the default tone rather than failing.
 */
export function badge(opts?: { tones?: Record<string, string>; tone?: string }): CellBadgeSpec {
    return { kind: 'badge', tones: opts?.tones, tone: opts?.tone };
}
/**
 * Render the cell as a status indicator — a dot and a label — with the same tone mapping as
 * {@link badge}.
 *
 * Reach for this when the value IS the state of the row (active, failed, pending); {@link badge} is
 * for a label that happens to be coloured, like a category or a tier.
 */
export function status(opts?: { tones?: Record<string, string>; tone?: string }): CellStatusSpec {
    return { kind: 'status', tones: opts?.tones, tone: opts?.tone };
}
/**
 * Render the cell as an anchor, with the href computed from the value and the whole row.
 *
 * `href` gets the row too, because the target is usually built from an id the cell does not show.
 * The URL is sanitised before it reaches the DOM, so a `javascript:` value coming back from a server
 * does not become a link that runs it.
 */
export function link(opts: { href: (value: unknown, row: CellRow) => string; text?: (value: unknown, row: CellRow) => string; target?: string }): CellLinkSpec {
    return { kind: 'link', href: opts.href, text: opts.text, target: opts.target };
}
/**
 * Render the cell as a formatted amount, via `Intl.NumberFormat`.
 *
 * Defaults to the document's locale and the currency you pass; omitting `currency` formats the
 * number without a symbol, which is what you want for a column whose unit is in the header.
 */
export function currency(opts?: { currency?: string; locale?: string }): CellCurrencySpec {
    return { kind: 'currency', currency: opts?.currency, locale: opts?.locale };
}
/**
 * Render the cell as a formatted date, via `Intl.DateTimeFormat`.
 *
 * Named `dateCell` rather than `date` because `date` is a word a consumer is likely to have already;
 * the other builders keep their obvious names.
 */
export function dateCell(opts?: { options?: Intl.DateTimeFormatOptions; locale?: string }): CellDateSpec {
    return { kind: 'date', options: opts?.options, locale: opts?.locale };
}
/**
 * Render a boolean as a check or a cross, with an accessible label for each.
 *
 * The labels are not decoration: an icon alone tells a screen reader nothing, so `trueLabel` /
 * `falseLabel` are what the cell actually announces.
 */
export function booleanIcon(opts?: { trueLabel?: string; falseLabel?: string }): CellBooleanIconSpec {
    return { kind: 'boolean-icon', trueLabel: opts?.trueLabel, falseLabel: opts?.falseLabel };
}
/**
 * Render a row of buttons in the cell — edit, delete, whatever the row affords.
 *
 * Each action carries its own label, icon and handler, and receives the row when clicked. Buttons,
 * not links: these do something to the row rather than navigate, and the distinction is what a
 * keyboard and a screen reader go by.
 */
export function actions(list: CellAction[]): CellActionsSpec {
    return { kind: 'actions', actions: list };
}

/**
 * Render the cell as ONE control that opens the row's menu.
 *
 * The other shape of {@link actions}, and the one to reach for past two entries: a row of four icon
 * buttons is the whole width of a 390px phone, and the actions a single record has and a selection
 * does not — duplicate, print, open in a new tab — have nowhere else to live. The trigger says
 * `aria-haspopup="menu"`, the menu is the grid's own (arrows, type-ahead, Escape back to the
 * trigger), and a click on either never reaches the row underneath.
 */
export function rowMenu(opts: { items: RowMenuItem[]; label?: string | ((row: CellRow) => string); icon?: string }): CellRowMenuSpec {
    return { kind: 'row-menu', items: opts.items, label: opts.label, icon: opts.icon };
}

export type ColumnType =
    | 'text' | 'number' | 'date' | 'boolean'
    | 'enum' | 'currency' | 'email' | 'custom';

export type AggregateType = 'sum' | 'avg' | 'count' | 'min' | 'max';

// ─── Resolved Column (internal, enriched) ────────────────────

export interface ResolvedColumn<T = unknown> {
    /** Original column definition. */
    def: ColumnDef<T>;
    /** Field path. */
    field: string;
    /** Display header text. */
    header: string;
    /** Resolved type (inferred or explicit). */
    type: ColumnType;
    /** Current width in px (signal-backed in composable). */
    width: number;
    /** Effective min width. */
    minWidth: number;
    /** Effective max width. */
    maxWidth: number;
    /** Text alignment. */
    align: 'left' | 'center' | 'right';
    /** Whether column is sortable. */
    sortable: boolean;
    /** Current sort direction (null = not sorted). */
    sortDir: 'asc' | 'desc' | null;
    /** Sort order index for multi-sort (0-based, -1 = not sorted). */
    sortIndex: number;
    /** Whether column is visible. */
    visible: boolean;
    /** Frozen side or null. */
    frozen: 'left' | 'right' | null;
    /** Flex grow factor (0 = fixed width). */
    flex: number;
    /** Parent column-group header text (column groups). null/undefined = top-level column. */
    group?: string | null;
    /** Parent column-group id (stable per group). null/undefined = top-level column. */
    groupId?: string | null;
}

// ─── Grid State (serializable for persistence) ───────────────

export interface GridState {
    columnOrder: string[];
    columnWidths: Record<string, number>;
    columnVisibility: Record<string, boolean>;
    sort: SortDescriptor[];
    filter: (FilterDescriptor | CompositeFilter)[];
    group: GroupDescriptor[];
    pageSize: number;
}

// ─── Grid Options ────────────────────────────────────────────

export type EditMode = 'none' | 'cell' | 'row' | 'modal' | 'batch';
export type SelectionMode = 'none' | 'single' | 'multiple';

/**
 * What a READER did to the columns.
 *
 * Three actions and not one «state changed», because a consumer that wants to know a column moved
 * should not have to diff a snapshot to find out which. The whole map travels with each one
 * anyway, so an application keeping a saved view has the state without asking for it.
 *
 * It is on the ACTIONS and not on the signals, and that is the decision: `loadState` writes the
 * same signals and is how an application PUTS a view back, so a grid that reported it would have
 * every app mark the view it had just applied as changed.
 */
export type ColumnChange =
    | { kind: 'reorder'; field: string; columnOrder: string[] }
    | { kind: 'visibility'; field: string; visible: boolean; columnVisibility: Record<string, boolean> }
    | { kind: 'resize'; field: string; width: number; columnWidths: Record<string, number> };

export interface DataGridOptions<T = unknown> {
    /** DataSource instance or raw array (auto-wraps in createDataSource). */
    source: unknown;
    /** Column definitions. */
    columns: ColumnDef<T>[];
    /** Enable virtual scrolling for large datasets. */
    virtualScroll?: boolean;
    /** Estimated row height for virtualizer. Default: 40. */
    rowHeight?: number;
    /** Edit mode. Default: 'none'. */
    editMode?: EditMode;
    /** Row selection mode. Default: 'none'. */
    selection?: SelectionMode;
    /** ID field for keyed operations. Default: 'id'. */
    idField?: string;
    /** Sticky header. Default: true. */
    stickyHeader?: boolean;
    /** State persistence key (localStorage). */
    stateKey?: string;
    /**
     * Called when a READER rearranges the columns: a reorder, a hide or show, a resize.
     *
     * Not called by `loadState`. See {@link ColumnChange} for why.
     */
    onColumnChange?: (change: ColumnChange) => void;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Humanize a field name: 'firstName' → 'First Name', 'address.city' → 'City'. */
export function humanizeField(field: string): string {
    // Use last segment for dotted paths
    const last = field.includes('.') ? field.split('.').pop()! : field;
    // camelCase/PascalCase → words
    return last
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
}

/** Get a nested property value via dotted path. */
export function getFieldValue(row: unknown, field: string): unknown {
    if (!row || typeof row !== 'object') return undefined;
    const parts = field.split('.');
    let current: unknown = row;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

/** Infer default alignment from column type. */
export function defaultAlign(type: ColumnType): 'left' | 'center' | 'right' {
    switch (type) {
        case 'number':
        case 'currency':
            return 'right';
        case 'boolean':
            return 'center';
        default:
            return 'left';
    }
}
