// DataSource — unified signal-based data manager.
// From createDataSource([1,2,3]) to server CRUD with autosave and form binding.
// Everything goes through DataSource: Select, Combobox, DataGrid, Form.

import { signal, computed, effect, batch } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';
import type {
    IDataTransport, DataRequest, DataResponse,
    SortDescriptor, FilterDescriptor, CompositeFilter, ChangeSet,
} from './transport';
import { matchesFilters, computeDiff } from './data-utils';
import type { GroupDescriptor, GroupResult } from './data-utils';
import { arrayTransport } from './array-transport';
import { createSelection } from '../component/selection';
import type { SelectionMode } from '../component/selection';

// ─── Types ─────────────────────────────────────────────────────

export interface DataSourceOptions<T> {
    /** Transport adapter. Optional if `data` is provided. */
    transport?: IDataTransport<T>;
    /** Inline data array — auto-creates arrayTransport. */
    data?: T[];
    /** Items per page. Default: 25. 0 = no pagination. */
    pageSize?: number;
    /** Initial sort. */
    sort?: SortDescriptor[];
    /** Initial filter. */
    filter?: (FilterDescriptor | CompositeFilter)[];
    /** Initial group. */
    group?: GroupDescriptor[];
    /** Field used as unique ID. Default: 'id'. */
    idField?: string;
    /** Additional static params sent with every request. */
    params?: Record<string, unknown>;
    /** Reactive params — returns undefined to skip loading (cascading pattern). */
    reactiveParams?: () => Record<string, unknown> | undefined;
    /** Auto-load on creation. Default: true. */
    autoLoad?: boolean;
    /** Debounce reads in ms. Default: 0. */
    debounceMs?: number;
    /** Auto-sync changes after mutation. true = 1000ms debounce. */
    autoSync?: boolean | { debounceMs: number };
    /** Apply changes optimistically on sync (rollback on error). */
    optimistic?: boolean;
    /** Enable selection tracking. */
    selection?: {
        mode: 'single' | 'multiple';
        /** Persist selected IDs to localStorage under this key. */
        persistKey?: string;
    };
    /** Persist accumulated data (infinite scroll) to sessionStorage under this key. */
    cacheKey?: string;
}

export type ChangeType = 'added' | 'updated' | 'removed';

/**
 * A change that happened on the SERVER and arrived by push — a socket message, an SSE event, an
 * SDK subscription. Bridge the transport into a signal with `fromCallback`, then hand each event
 * here.
 */
export interface ServerChange<T> {
    type: 'created' | 'updated' | 'deleted';
    item: T;
}

/**
 * What the source did with a pushed change:
 * - `applied`  — it is on screen now;
 * - `shadowed` — the row has an unsaved local edit, so the user still sees theirs; the server's
 *   value is underneath, and a rollback will land on it. Tell the user something arrived;
 * - `ignored`  — it is not about this page (a row this page does not hold, or a creation the
 *   current filter excludes). The next read will pick it up if it belongs.
 */
export type ServerChangeOutcome = 'applied' | 'shadowed' | 'ignored';

interface TrackedItem<T> {
    item: T;
    type: ChangeType;
    original?: T;
}

export interface DataSource<T> {
    // ─── Read ─────────────────────────────────────
    data: ReadonlySignal<T[]>;
    total: ReadonlySignal<number>;
    isLoading: ReadonlySignal<boolean>;
    error: ReadonlySignal<Error | null>;
    page: ReadonlySignal<number>;
    pageSize: ReadonlySignal<number>;
    sort: ReadonlySignal<SortDescriptor[]>;
    filter: ReadonlySignal<(FilterDescriptor | CompositeFilter)[]>;
    group: ReadonlySignal<GroupDescriptor[]>;
    totalPages: ReadonlySignal<number>;
    groups: ReadonlySignal<GroupResult<T>[] | undefined>;

    /** The quick search term, '' when there is none. Not part of `filter`: it has no chip and a view does not keep it. */
    search: ReadonlySignal<string>;

    setSort(sort: SortDescriptor[]): void;
    setFilter(filter: (FilterDescriptor | CompositeFilter)[]): void;
    /**
     * Look for `term` in `fields`: a row stays when any of them contains it, case-insensitively.
     * The transport receives it as an OR of `contains` appended to the filter — the shape every
     * adapter already sends. A blank term clears it.
     */
    setSearch(term: string, fields: string[]): void;
    setPage(page: number): void;
    setPageSize(size: number): void;
    setGroup(group: GroupDescriptor[]): void;
    refresh(): Promise<void>;

    // ─── Infinite scroll ──────────────────────────
    /** Load next page and append to existing data (infinite scroll). */
    loadMore(): Promise<void>;
    /** Whether there are more pages to load (reactive). */
    hasMore: ReadonlySignal<boolean>;
    /** Total items loaded so far across all appended pages (reactive). */
    loadedCount: ReadonlySignal<number>;
    /** Reset to page 1, clear accumulated data. */
    reset(): Promise<void>;

    // ─── ID access (for select-all across pages) ──
    /** Get all IDs matching current filter. Array: sync from memory. Server: fetches with pageSize=0. */
    getAllIds(): Promise<unknown[]>;
    /**
     * Every ROW the current filter and sort select — not the current page. For an export, which
     * wants what the user filtered to and not what fits on screen.
     */
    getAllRows(): Promise<T[]>;
    /** Distinct values of a field across ALL data (Set/Excel filter). Server: pageSize=0. */
    distinctValues(field: string): Promise<unknown[]>;

    // ─── Selection (opt-in via options.selection) ──
    //
    // A `pdx-data-grid` keeps a selection of its own (its `pdx-selection-change` event, its host API
    // `el.getSelectedIds()` / `el.clearSelection()`), and hands it to this source only when the source
    // opted in with `options.selection`: then `selected`, `selectedItems` and `selectedCount` mirror
    // the rows the user ticked. A source that did not opt in stays empty — read the grid instead.
    // (Asserted in ui's data-grid-source-selection.test.ts.)
    /**
     * Whether this source keeps a selection at all (`options.selection` was given).
     *
     * A component cannot infer it: `selected` answers an empty Set either way. `pdx-data-grid` reads
     * this to decide whether to hand its selection over — a source that never opted in must not
     * acquire selection state it did not ask for.
     */
    selectionEnabled: boolean;
    /** Selected IDs (reactive). Empty Set if selection not enabled. */
    selected: ReadonlySignal<Set<unknown>>;
    /** Selected items resolved from current data (reactive). */
    selectedItems: ReadonlySignal<T[]>;
    /** Count of selected items (includes items on other pages). */
    selectedCount: ReadonlySignal<number>;
    /** Select an item by ID. */
    select(id: unknown): void;
    /** Deselect an item by ID. */
    deselect(id: unknown): void;
    /** Toggle selection of an item. */
    toggleSelect(id: unknown): void;
    /** Select all items matching current filter (uses getAllIds). */
    selectAll(): Promise<void>;
    /** Clear all selections. */
    deselectAll(): void;
    /**
     * Replace the whole selection in one operation.
     *
     * One gesture, one change: a shift-click over 200 rows through `select(id)` would be 200
     * notifications and, with `persistKey`, 200 writes to localStorage. In `single` mode only the
     * first id survives — a source must not end up holding a selection its own API could not produce.
     * A no-op when selection is not enabled.
     */
    setSelected(ids: unknown[]): void;
    /** Check if an item is selected. */
    isSelected(id: unknown): boolean;

    // ─── Change tracking ──────────────────────────
    add(item: T): void;
    update(item: T): void;
    remove(item: T): void;
    /** Partial update: merge fields into existing item. */
    patch(id: unknown, partial: Partial<T>): void;
    /** Get single item by ID from current data. */
    getById(id: unknown): T | undefined;
    /**
     * Apply a change that came from the SERVER (a socket push), not from the user.
     *
     * Unlike `update()`/`remove()` it records nothing in the change set, sends nothing back, and
     * reloads nothing — so the selection, the scroll offset and an open editor all survive.
     * Returns what it did; `shadowed` means the row had an unsaved local edit and the user is
     * still seeing theirs.
     */
    applyServerChange(change: ServerChange<T>): ServerChangeOutcome;
    changes: ReadonlySignal<ChangeSet<T>>;
    hasChanges: ReadonlySignal<boolean>;
    sync(): Promise<void>;
    cancelChanges(): void;
    /**
     * Undo the tracked change for ONE row: it goes back to what the last load said.
     *
     * `cancelChanges()` is the whole change set, which is the wrong instrument for a rollback.
     * A page that removes a row optimistically, calls the transport itself and has to put the row
     * back on a refusal needs another exit — on a grid with inline editing `cancelChanges()` throws
     * away every unsaved edit on screen.
     *
     * The id is the row's `idField` value, which is the key `add`, `update`, `remove` and `patch`
     * already write under. An id with nothing tracked against it changes nothing and notifies
     * nobody.
     */
    revert(id: unknown): void;

    // ─── Persistence management ─────────────────────
    /** Clear cached infinite scroll data (sessionStorage). */
    clearCache(): void;
    /** Clear persisted selection (localStorage). */
    clearSelection(): void;
    /** Clear all persisted state (cache + selection). */
    clearPersisted(): void;

    // ─── Form bridge ──────────────────────────────
    /** Bind a form to a record — form changes flow to DataSource. */
    bindForm(form: FormBridge, id?: unknown): Dispose;

    dispose(): void;
}

/** Minimal form interface for binding (avoids hard dependency on FormEngine). */
export interface FormBridge {
    getValues(): Record<string, unknown>;
    setValues(values: Record<string, unknown>): void;
    readonly state: { dirty: ReadonlySignal<boolean>; values: ReadonlySignal<Record<string, unknown>> };
}

/** Type guard: check if a value is a DataSource instance. */
export function isDataSource<T = unknown>(value: unknown): value is DataSource<T & Record<string, unknown>> {
    if (value == null || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.setFilter === 'function'
        && typeof v.setSort === 'function'
        && typeof v.refresh === 'function'
        && typeof v.data === 'function';
}

// ─── createDataSource ────────────────────────────────────────

/**
 * The reactive state behind a list: paging, sorting, filtering and grouping, over any transport.
 *
 * Pass an array and it uses {@link arrayTransport} — everything client-side; pass a `transport` and
 * the same API sends the descriptors to a server instead. That symmetry is the point: a grid built
 * against an array does not change when the data outgrows the browser.
 *
 * `data()`, `total()`, `loading()` and `error()` are signals, so a template re-renders on a page or
 * sort change without being told to.
 */
export function createDataSource<T extends Record<string, unknown>>(
    data: T[],
): DataSource<T>;
export function createDataSource<T extends Record<string, unknown>>(
    options: DataSourceOptions<T>,
): DataSource<T>;
export function createDataSource<T extends Record<string, unknown>>(
    arg: T[] | DataSourceOptions<T>,
): DataSource<T> {
    const options: DataSourceOptions<T> = Array.isArray(arg)
        ? { data: arg, pageSize: 0 }
        : arg;

    // Resolve transport: explicit > data array > error
    const idField = options.idField ?? 'id';
    const transport: IDataTransport<T> = options.transport
        ?? (options.data
            ? arrayTransport({ data: options.data, idField })
            : (() => { throw new Error('createDataSource requires either "transport" or "data"'); })()
        );

    const autoLoad = options.autoLoad ?? true;
    const debounceMs = options.debounceMs ?? 0;
    const isOptimistic = options.optimistic ?? false;

    // ─── Signals ──────────────────────────────────
    const _data = signal<T[]>([]);
    const _total = signal(-1);
    // Number of items the most recent read() returned. Used to infer hasMore when
    // the server doesn't report a total (-1): a full page implies more may exist.
    const _lastPageCount = signal(-1);
    const _isLoading = signal(false);
    const _error = signal<Error | null>(null);
    const _page = signal(1);
    const _pageSize = signal(options.pageSize ?? 25);
    const _sort = signal<SortDescriptor[]>(options.sort ?? []);
    const _filter = signal<(FilterDescriptor | CompositeFilter)[]>(options.filter ?? []);
    const _search = signal('');
    let _searchFields: string[] = [];
    const _group = signal<GroupDescriptor[]>(options.group ?? []);

    /**
     * The filter a request carries: the reader's, plus the quick search as one OR of `contains`
     * over its fields. One place, so a page load, an export and a select-all agree on the rows.
     */
    function requestFilter(): (FilterDescriptor | CompositeFilter)[] {
        const filter = _filter.peek();
        const term = _search.peek();
        if (!term || _searchFields.length === 0) return filter;
        return [...filter, {
            logic: 'or',
            filters: _searchFields.map((field): FilterDescriptor => ({ field, operator: 'contains', value: term })),
        }];
    }
    const _groups = signal<GroupResult<T>[] | undefined>(undefined);

    // Infinite scroll: accumulated data across pages
    const _accumulated = signal<T[]>([]);
    const _isAppendMode = signal(false);

    // Change tracking
    const _tracked = signal<Map<unknown, TrackedItem<T>>>(new Map());

    const _changes = computed<ChangeSet<T>>(() => {
        const map = _tracked();
        const added: T[] = [], updated: T[] = [], removed: T[] = [];
        for (const entry of map.values()) {
            if (entry.type === 'added') added.push(entry.item);
            else if (entry.type === 'updated') updated.push(entry.item);
            else if (entry.type === 'removed') removed.push(entry.item);
        }
        return { added, updated, removed };
    });
    const _hasChanges = computed(() => _tracked().size > 0);

    const _totalPages = computed(() => {
        const ps = _pageSize();
        const t = _total();
        if (t <= 0 || ps <= 0) return 1;
        return Math.ceil(t / ps);
    });

    const _loadedCount = computed(() => {
        return _isAppendMode() ? _accumulated().length : _data().length;
    });
    const _hasMore = computed(() => {
        const t = _total();
        // Known total: more exists while we haven't loaded all of it.
        // Distinguishes 0 (empty result → no more) from -1 (unknown).
        if (t >= 0) return _loadedCount() < t;
        // Unknown total (-1): infer from the last page. A full page (count ===
        // pageSize) means there may be more; a short/empty page means we're done.
        const last = _lastPageCount();
        if (last < 0) return false; // nothing fetched yet
        return last >= _pageSize();
    });

    // View: merge server data (or accumulated) with local changes
    const _viewData = computed(() => {
        const serverData = _isAppendMode() ? _accumulated() : _data();
        const map = _tracked();
        if (map.size === 0) return serverData;

        const activeFilters = _filter();
        const result = serverData
            .filter(item => {
                const id = item[idField];
                const entry = map.get(id);
                return !entry || entry.type !== 'removed';
            })
            .map(item => {
                const id = item[idField];
                const entry = map.get(id);
                return (entry && entry.type === 'updated') ? entry.item : item;
            });

        for (const entry of map.values()) {
            if (entry.type === 'added' && matchesFilters(entry.item, activeFilters)) {
                result.push(entry.item);
            }
        }
        return result;
    });

    // ─── Load ─────────────────────────────────────
    let abortController: AbortController | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let _params = { ...options.params };

    async function load(): Promise<void> {
        if (abortController) abortController.abort();
        // Capture THIS load's controller locally. A later load() reassigns the
        // shared `abortController`; comparing against `local` (not the current
        // shared one) ensures a superseded response never writes stale data.
        const local = abortController = new AbortController();

        _isLoading.set(true);
        _error.set(null);

        const request: DataRequest = {
            page: _page.peek(),
            pageSize: _pageSize.peek(),
            sort: _sort.peek(),
            filter: requestFilter(),
            group: _group.peek().length > 0 ? _group.peek() : undefined,
            params: _params,
        };

        try {
            const response: DataResponse<T> = await transport.read(request);
            if (local.signal.aborted || abortController !== local) return;
            _distinctCache.clear(); // the dataset changed: the distinct values must be recomputed
            batch(() => {
                _data.set(response.data);
                _total.set(response.total);
                _lastPageCount.set(response.data.length);
                _groups.set(response.groups);
                // In append mode, accumulate data across pages
                if (_isAppendMode.peek()) {
                    _accumulated.set(prev => [...prev, ...response.data]);
                    persistCache();
                }
                _isLoading.set(false);
            });
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            // A superseded load must not overwrite the current load's state.
            if (local.signal.aborted || abortController !== local) return;
            batch(() => {
                _error.set(err instanceof Error ? err : new Error(String(err)));
                _isLoading.set(false);
            });
        }
    }

    function debouncedLoad(): void {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (debounceMs > 0) {
            debounceTimer = setTimeout(load, debounceMs);
        } else {
            load();
        }
    }

    // ─── AutoSync ─────────────────────────────────
    let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
    const autoSyncMs = typeof options.autoSync === 'object'
        ? options.autoSync.debounceMs
        : (options.autoSync ? 1000 : 0);

    function scheduleAutoSync(): void {
        if (autoSyncMs <= 0) return;
        if (autoSyncTimer) clearTimeout(autoSyncTimer);
        autoSyncTimer = setTimeout(() => sync(), autoSyncMs);
    }

    // ─── Cascading params ─────────────────────────
    let cascadingDispose: Dispose | null = null;
    if (options.reactiveParams) {
        cascadingDispose = effect(() => {
            const params = options.reactiveParams!();
            if (params === undefined) return;
            const hasUndefined = Object.values(params).some(v => v === undefined);
            if (hasUndefined) return;
            _params = { ...options.params, ...params };
            _page.set(1);
            debouncedLoad();
        });
    }

    // ─── Selection (opt-in) ─────────────────────────
    const selOpts = options.selection;
    const _selectionEnabled = !!selOpts;

    // Restore persisted selection
    let _persistedSelected: Set<unknown> | undefined;
    if (selOpts?.persistKey && typeof localStorage !== 'undefined') {
        try {
            const raw = localStorage.getItem(`pdx-ds-sel:${selOpts.persistKey}`);
            if (raw) _persistedSelected = new Set(JSON.parse(raw));
        } catch { /* ignore corrupt data */ }
    }

    const _selection = _selectionEnabled
        ? createSelection<unknown>({
            mode: (selOpts!.mode as SelectionMode) ?? 'single',
            behavior: selOpts!.mode === 'multiple' ? 'toggle' : 'replace',
            defaultSelected: _persistedSelected,
            onSelectionChange: (selected) => {
                // Persist to localStorage if configured
                if (selOpts?.persistKey && typeof localStorage !== 'undefined') {
                    try { localStorage.setItem(`pdx-ds-sel:${selOpts.persistKey}`, JSON.stringify([...selected])); }
                    catch { /* quota exceeded */ }
                }
            },
        })
        : null;

    const _noSelection = signal<Set<unknown>>(new Set());
    const _selectedSignal = _selection?.selected ?? _noSelection as ReadonlySignal<Set<unknown>>;
    const _selectedItems = computed(() => {
        const sel = _selectedSignal();
        if (sel.size === 0) return [] as T[];
        return _viewData().filter(item => sel.has(item[idField]));
    });
    const _selectedCount = computed(() => _selectedSignal().size);

    // ─── Cache persistence (sessionStorage) ───────
    if (options.cacheKey && typeof sessionStorage !== 'undefined') {
        // Restore cached accumulated data on init
        try {
            const raw = sessionStorage.getItem(`pdx-ds-cache:${options.cacheKey}`);
            if (raw) {
                const cached = JSON.parse(raw) as { data: T[]; page: number; total: number };
                _accumulated.set(cached.data);
                _page.set(cached.page);
                _total.set(cached.total);
                _isAppendMode.set(true);
            }
        } catch { /* ignore */ }
    }

    // Persist cache on each load (in append mode)
    function persistCache(): void {
        if (!options.cacheKey || typeof sessionStorage === 'undefined') return;
        if (!_isAppendMode.peek()) return;
        try {
            sessionStorage.setItem(`pdx-ds-cache:${options.cacheKey}`, JSON.stringify({
                data: _accumulated.peek(),
                page: _page.peek(),
                total: _total.peek(),
            }));
        } catch { /* quota exceeded */ }
    }

    // ─── Public API ───────────────────────────────

    // Changing the query (sort/filter/page-size/group) invalidates any accumulated
    // infinite-scroll pages: without leaving append mode the next load would append page 1 to
    // the old pages → duplicated rows. reset()/clearCache() do this too.
    function exitAppendMode(): void {
        if (_isAppendMode.peek()) {
            _isAppendMode.set(false);
            _accumulated.set([]);
        }
    }

    function setSort(sort: SortDescriptor[]): void {
        exitAppendMode(); _sort.set(sort); _page.set(1); debouncedLoad();
    }

    function setFilter(filter: (FilterDescriptor | CompositeFilter)[]): void {
        exitAppendMode(); _filter.set(filter); _page.set(1); debouncedLoad();
    }

    function setSearch(term: string, fields: string[]): void {
        const next = (term ?? '').trim();
        const sameFields = fields.length === _searchFields.length && fields.every((f, i) => f === _searchFields[i]);
        if (next === _search.peek() && sameFields) return;
        _searchFields = [...fields];
        exitAppendMode(); _search.set(next); _page.set(1); debouncedLoad();
    }

    function setPage(page: number): void {
        _page.set(Math.max(1, page)); debouncedLoad();
    }

    function setPageSize(size: number): void {
        exitAppendMode(); _pageSize.set(size); _page.set(1); debouncedLoad();
    }

    function setGroup(group: GroupDescriptor[]): void {
        exitAppendMode(); _group.set(group); _page.set(1); debouncedLoad();
    }

    async function refresh(): Promise<void> { await load(); }

    // ─── Infinite scroll ──────────────────────────

    async function loadMore(): Promise<void> {
        if (!_hasMore.peek()) return;
        // A loadMore during a load in progress would increment the page twice:
        // the first response is discarded by the abort and a hole is left
        // in the accumulated data.
        if (_isLoading.peek()) return;
        // First time entering append mode: seed with current data
        if (!_isAppendMode.peek()) {
            _isAppendMode.set(true);
            _accumulated.set(_data.peek().slice());
        }
        _page.set(p => p + 1);
        await load();
    }

    async function reset(): Promise<void> {
        _isAppendMode.set(false);
        _accumulated.set([]);
        _page.set(1);
        await load();
    }

    // ─── getAllIds (for select-all across pages) ──

    /**
     * Every row the current filter and sort select, not the current page.
     *
     * The twin of `getAllIds`, and the same trip: `pageSize: 0` asks the transport for the lot. An
     * export wants the ROWS — a user who filtered 8000 down to 40 wants those 40, and the page
     * they happen to be looking at is not the answer.
     *
     * Sorted the way the screen is sorted, because a file whose order differs from the list it
     * came from is a file nobody can check against the screen.
     */
    async function getAllRows(): Promise<T[]> {
        const request: DataRequest = {
            page: 1,
            pageSize: 0,
            sort: _sort.peek(),
            filter: requestFilter(),
            params: _params,
        };
        const response = await transport.read(request);
        return response.data;
    }

    async function getAllIds(): Promise<unknown[]> {
        // Try to get all from a full request (pageSize: 0 = load all)
        const request: DataRequest = {
            page: 1,
            pageSize: 0,
            sort: _sort.peek(),
            filter: requestFilter(),
            params: _params,
        };
        const response = await transport.read(request);
        return response.data.map(item => item[idField]);
    }

    // ─── distinctValues (a Set/Excel filter — the distinct values of a field) ──

    // A cache of the distinct values per field: without it, the grid's set filter opening N
    // columns means N full scans of the server dataset. Invalidated on every successful load/sync.
    const _distinctCache = new Map<string, unknown[]>();

    async function distinctValues(field: string): Promise<unknown[]> {
        const cached = _distinctCache.get(field);
        if (cached) return cached;
        // All the records (pageSize 0), WITHOUT a filter: the set filter shows the universe
        // of the field's values, not only the ones already filtered.
        const request: DataRequest = { page: 1, pageSize: 0, sort: [], filter: [], params: _params };
        const response = await transport.read(request);
        const seen = new Set<unknown>();
        const out: unknown[] = [];
        for (const item of response.data) {
            const v = (item as Record<string, unknown>)[field];
            const key = v == null ? ' __null__' : v;
            if (!seen.has(key)) { seen.add(key); out.push(v); }
        }
        _distinctCache.set(field, out);
        return out;
    }

    // ─── Selection API ─────────────────────────────

    function dsSelect(id: unknown): void { _selection?.select(id); }
    function dsSetSelected(ids: unknown[]): void {
        if (!_selection) return;
        // `selectAll` on the primitive replaces the set outright, which is exactly this — but it is
        // gated on multiple mode, so single is handled here rather than falling through to a no-op.
        if (selOpts?.mode === 'multiple') _selection.selectAll(ids);
        else if (ids.length === 0) _selection.clear();
        else _selection.select(ids[0]);
    }
    function dsDeselect(id: unknown): void { _selection?.deselect(id); }
    function dsToggleSelect(id: unknown): void { _selection?.toggle(id); }
    function dsDeselectAll(): void { _selection?.clear(); }
    function dsIsSelected(id: unknown): boolean { return _selection?.isSelected(id) ?? false; }
    async function dsSelectAll(): Promise<void> {
        if (!_selection) return;
        const ids = await getAllIds();
        _selection.selectAll(ids);
    }

    // ─── Cache/Persistence management ─────────────

    /** Clear cached scroll data (sessionStorage). */
    function clearCache(): void {
        if (options.cacheKey && typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(`pdx-ds-cache:${options.cacheKey}`);
        }
        _accumulated.set([]);
        _isAppendMode.set(false);
    }

    /** Clear persisted selection (localStorage). */
    function clearSelection(): void {
        _selection?.clear();
        if (selOpts?.persistKey && typeof localStorage !== 'undefined') {
            localStorage.removeItem(`pdx-ds-sel:${selOpts.persistKey}`);
        }
    }

    /** Clear all persisted state (cache + selection). */
    function clearPersisted(): void {
        clearCache();
        clearSelection();
    }

    // ─── Change tracking ──────────────────────────

    let _tempIdSeq = 0;

    function add(item: T): void {
        _tracked.set(prev => {
            const next = new Map(prev);
            let id = item[idField];
            let entry = item;
            if (id == null) {
                // The temporary id must go on the item TOO: without it, update()/getById()/selection
                // on the same record would use undefined and create a second entry.
                id = `__new_${++_tempIdSeq}`;
                entry = { ...item, [idField]: id };
            }
            next.set(id, { item: entry, type: 'added' });
            return next;
        });
        scheduleAutoSync();
    }

    function update(item: T): void {
        const id = item[idField];
        _tracked.set(prev => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing?.type === 'added') {
                next.set(id, { item, type: 'added' });
            } else {
                const original = existing?.original ?? _data.peek().find(d => d[idField] === id);
                next.set(id, { item, type: 'updated', original: original as T });
            }
            return next;
        });
        scheduleAutoSync();
    }

    function remove(item: T): void {
        const id = item[idField];
        _tracked.set(prev => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing?.type === 'added') {
                next.delete(id);
            } else {
                next.set(id, { item, type: 'removed' });
            }
            return next;
        });
        scheduleAutoSync();
    }

    function patchItem(id: unknown, partial: Partial<T>): void {
        const existing = _viewData.peek().find(item => item[idField] === id);
        if (!existing) return;
        update({ ...existing, ...partial });
    }

    function getById(id: unknown): T | undefined {
        return _viewData.peek().find(item => item[idField] === id);
    }

    // ─── A change that came FROM the server ───────
    //
    // `update()` and `remove()` record what the USER did: the row goes into the change set, and
    // `sync()` sends it on. A socket push is the other direction, and putting one through
    // `update()` tells the screen three untrue things — that there is unsaved work, that it should
    // be sent back to the server that just sent it, and that `cancelChanges()` should restore the
    // pre-push row, which no longer exists anywhere.
    //
    // So this writes into the loaded page UNDERNEATH the change set: no tracking, no sync, no
    // reload. No reload is the point — reloading is what loses the selection, the scroll offset
    // and an open editor, which is exactly what a live list must not do.
    function applyServerChange(change: ServerChange<T>): ServerChangeOutcome {
        const id = change.item[idField];
        const local = _tracked.peek().get(id);

        const inPage = (_isAppendMode.peek() ? _accumulated.peek() : _data.peek())
            .some(row => row[idField] === id);

        // A push about a row this page does not hold, and is not a creation that belongs here.
        // Inventing it would put a row on screen that the current filter, sort and page say does
        // not belong — the next refresh would silently remove it again.
        if (!inPage && change.type !== 'created') return 'ignored';
        if (change.type === 'created') {
            if (inPage) return 'ignored';
            if (!matchesFilters(change.item, _filter.peek())) return 'ignored';
        }

        const write = (rows: T[]): T[] => {
            switch (change.type) {
                case 'created': return [...rows, change.item];
                case 'updated': return rows.map(row => (row[idField] === id ? change.item : row));
                case 'deleted': return rows.filter(row => row[idField] !== id);
            }
        };

        batch(() => {
            if (_isAppendMode.peek()) _accumulated.set(write(_accumulated.peek()));
            else _data.set(write(_data.peek()));

            const total = _total.peek();
            if (total >= 0 && change.type === 'created') _total.set(total + 1);
            if (total > 0 && change.type === 'deleted') _total.set(total - 1);

            // A selected id whose row is gone is a selection nobody can act on: the bulk bar still
            // counts it and every action over it fails.
            if (change.type === 'deleted') _selection?.deselect(id);

            // The row has an unsaved local edit on top. The edit stays in front of the user —
            // yanking a field from under someone mid-sentence is worse than being briefly stale —
            // but `original` becomes what the server now says, so a rollback lands on the current
            // truth instead of restoring a value that no longer exists.
            if (local && local.type !== 'added') {
                _tracked.set(prev => {
                    const next = new Map(prev);
                    const entry = next.get(id);
                    if (entry) next.set(id, { ...entry, original: change.type === 'deleted' ? undefined : change.item });
                    return next;
                });
            }
        });

        return local ? 'shadowed' : 'applied';
    }

    // ─── Sync ─────────────────────────────────────

    // Serialize sync(): two overlapping syncs would both read the still-unpruned changeset and
    // re-send the same added rows → duplicate records on the server. While one is in
    // flight, later calls just flag a re-run, executed once the current one settles so
    // changes made during the flight are not lost.
    let _syncing = false;
    let _syncQueued = false;

    async function sync(): Promise<void> {
        if (_syncing) { _syncQueued = true; return; }
        _syncing = true;
        try {
            do {
                _syncQueued = false;
                await runSyncOnce();
            } while (_syncQueued);
        } finally {
            _syncing = false;
        }
    }

    async function runSyncOnce(): Promise<void> {
        const cs = _changes.peek();
        if (cs.added.length === 0 && cs.updated.length === 0 && cs.removed.length === 0) return;

        // A working copy of the pending changes: every successful operation is PRUNED straight away,
        // so a partial failure does not re-run on retry the creates/updates already persisted
        // (a duplicated create = a duplicated record on the server). The entries (with `original`)
        // are needed by the PATCH-diff path in optimistic mode too, where _tracked has already been
        // emptied.
        const pending = new Map(_tracked.peek());

        let snapshot: T[] | null = null;

        if (isOptimistic) {
            // The optimistic update is applied to the ACTIVE dataset: in append mode the view reads
            // _accumulated, not _data.
            const appendMode = _isAppendMode.peek();
            snapshot = (appendMode ? _accumulated.peek() : _data.peek()).slice();
            batch(() => {
                if (appendMode) _accumulated.set(_viewData.peek());
                else _data.set(_viewData.peek());
                _tracked.set(new Map());
            });
        }

        _isLoading.set(true);
        _error.set(null);

        const byType = (t: ChangeType) => [...pending.entries()].filter(([, e]) => e.type === t);

        try {
            // Use PATCH for updates when transport supports it
            if (transport.batch) {
                try {
                    await transport.batch(cs);
                    pending.clear();
                } catch (err) {
                    // Prune the ops that DID persist so the restore below (and any retry)
                    // doesn't re-send them → no duplicate creates on partial failure.
                    const applied = (err as { appliedInputs?: Set<unknown> }).appliedInputs;
                    if (applied) {
                        for (const [key, entry] of pending) {
                            if (applied.has(entry.item)) pending.delete(key);
                        }
                    }
                    throw err;
                }
            } else {
                for (const [key, entry] of byType('added')) {
                    if (transport.create) await transport.create(entry.item);
                    pending.delete(key);
                }
                for (const [key, entry] of byType('updated')) {
                    // Try PATCH if available and we have a diff
                    let done = false;
                    if (transport.patch && entry.original) {
                        const diff = computeDiff(entry.original, entry.item);
                        if (diff) {
                            await transport.patch(entry.item[idField], diff);
                            done = true;
                        }
                    }
                    if (!done && transport.update) await transport.update(entry.item);
                    pending.delete(key);
                }
                for (const [key, entry] of byType('removed')) {
                    if (transport.destroy) await transport.destroy(entry.item);
                    pending.delete(key);
                }
            }

            if (!isOptimistic) {
                _tracked.set(new Map());
                await load();
            } else {
                _isLoading.set(false);
                load(); // background refresh
            }
        } catch (err) {
            if (isOptimistic && snapshot) {
                batch(() => {
                    if (_isAppendMode.peek()) _accumulated.set(snapshot!);
                    else _data.set(snapshot!);
                    // It restores ONLY what is left unsynced: the operations that succeeded
                    // are on the server and must not be sent again.
                    _tracked.set(pending);
                    _error.set(err instanceof Error ? err : new Error(String(err)));
                    _isLoading.set(false);
                });
            } else {
                batch(() => {
                    _tracked.set(pending);
                    _error.set(err instanceof Error ? err : new Error(String(err)));
                    _isLoading.set(false);
                });
            }
        }
    }

    function cancelChanges(): void {
        _tracked.set(new Map());
    }

    /**
     * Drop the tracked change for one row.
     *
     * A new Map rather than a mutation, like every other write to `_tracked`: the signal compares
     * by reference, and mutating in place would change the view without telling anybody.
     *
     * Nothing tracked for that id is not an error and not a notification either — the state did
     * not change, and a spurious one would re-run every effect reading `changes()`.
     */
    function revert(id: unknown): void {
        const current = _tracked.peek();
        if (!current.has(id)) return;
        const next = new Map(current);
        next.delete(id);
        _tracked.set(next);
    }

    // ─── Form bridge ──────────────────────────────

    function bindForm(form: FormBridge, id?: unknown): Dispose {
        // Form → DataSource: when form values change, push to change tracking
        const disposeWatch = effect(() => {
            const isDirty = form.state.dirty();
            if (!isDirty) return;
            const values = form.state.values() as T;
            if (id !== undefined) {
                (values as Record<string, unknown>)[idField] = id;
                patchItem(id, values);
            }
        });

        // DataSource → Form: on refresh, update form if not dirty
        const disposeRefresh = effect(() => {
            if (id === undefined) return;
            const items = _viewData();
            const current = items.find(item => item[idField] === id);
            if (current && !form.state.dirty.peek()) {
                form.setValues(current as Record<string, unknown>);
            }
        });

        return () => { disposeWatch(); disposeRefresh(); };
    }

    // ─── Dispose ──────────────────────────────────

    function dispose(): void {
        if (abortController) abortController.abort();
        if (debounceTimer) clearTimeout(debounceTimer);
        if (autoSyncTimer) clearTimeout(autoSyncTimer);
        if (cascadingDispose) cascadingDispose();
    }

    // Auto-load (skip if cascading params are defined — they control loading)
    if (autoLoad && !options.reactiveParams) load();

    return {
        data: _viewData,
        total: _total as ReadonlySignal<number>,
        isLoading: _isLoading as ReadonlySignal<boolean>,
        error: _error as ReadonlySignal<Error | null>,
        page: _page as ReadonlySignal<number>,
        pageSize: _pageSize as ReadonlySignal<number>,
        sort: _sort as ReadonlySignal<SortDescriptor[]>,
        filter: _filter as ReadonlySignal<(FilterDescriptor | CompositeFilter)[]>,
        search: _search as ReadonlySignal<string>,
        group: _group as ReadonlySignal<GroupDescriptor[]>,
        totalPages: _totalPages,
        groups: _groups as ReadonlySignal<GroupResult<T>[] | undefined>,
        setSort, setFilter, setSearch, setPage, setPageSize, setGroup, refresh,
        loadMore, hasMore: _hasMore, loadedCount: _loadedCount, reset,
        getAllIds,
        getAllRows,
        distinctValues,
        selected: _selectedSignal,
        selectedItems: _selectedItems,
        selectedCount: _selectedCount,
        select: dsSelect, deselect: dsDeselect, toggleSelect: dsToggleSelect,
        selectAll: dsSelectAll, deselectAll: dsDeselectAll, isSelected: dsIsSelected,
        setSelected: dsSetSelected,
        selectionEnabled: _selectionEnabled,
        add, update, remove,
        patch: patchItem,
        getById,
        applyServerChange,
        changes: _changes, hasChanges: _hasChanges,
        sync, cancelChanges, revert,
        clearCache, clearSelection, clearPersisted,
        bindForm,
        dispose,
    };
}
