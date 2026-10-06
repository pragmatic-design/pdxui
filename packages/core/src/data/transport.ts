// DataSource transport interface — pluggable backends.
// Adapters: restTransport, pragmaticTransport, odataTransport, devexpressTransport, graphqlTransport.

import type { GroupDescriptor, GroupResult } from './data-utils';
export type { GroupDescriptor, AggregateDescriptor, GroupResult } from './data-utils';

// ─── Types ─────────────────────────────────────────────────────

export interface DataRequest {
    /** Current page (1-based). */
    page: number;
    /** Items per page. */
    pageSize: number;
    /** Sort descriptors. */
    sort: SortDescriptor[];
    /** Filter descriptors, composites included — the shape a DataSource actually sends. */
    filter: (FilterDescriptor | CompositeFilter)[];
    /** Group descriptors (server-side grouping). */
    group?: GroupDescriptor[];
    /** Additional params from the consumer. */
    params?: Record<string, unknown>;
}

export interface DataResponse<T> {
    /** Data for the current page. */
    data: T[];
    /** Total count (server-side) for pagination. -1 if unknown. */
    total: number;
    /** Grouped data (when group descriptors are sent). */
    groups?: GroupResult<T>[];
}

export interface SortDescriptor {
    field: string;
    dir: 'asc' | 'desc';
}

export type FilterOperator =
    | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
    | 'contains' | 'startswith' | 'endswith'
    | 'isnull' | 'isnotnull'
    | 'in' | 'notin'
    | 'between'
    // Relative date presets — a dynamic range computed against "now", with no value.
    | 'today' | 'yesterday' | 'thisweek' | 'thismonth' | 'thisyear' | 'last7days' | 'last30days';

export interface FilterDescriptor {
    field: string;
    operator: FilterOperator;
    value: unknown;
}

export interface CompositeFilter {
    logic: 'and' | 'or';
    filters: (FilterDescriptor | CompositeFilter)[];
}

export interface ChangeSet<T> {
    added: T[];
    updated: T[];
    removed: T[];
}

// ─── Transport Interface ──────────────────────────────────────

export interface IDataTransport<T> {
    /** Read data with pagination, sort, filter. */
    read(request: DataRequest): Promise<DataResponse<T>>;
    /** Create a new item. Returns the created item (with server-generated fields). */
    create?(item: Partial<T>): Promise<T>;
    /** Update an item (full replacement). Returns the updated item. */
    update?(item: T): Promise<T>;
    /** Partial update. Falls back to full update if not provided. */
    patch?(id: unknown, partial: Partial<T>): Promise<T>;
    /** Delete an item. */
    destroy?(item: T): Promise<void>;
    /** Batch sync: send all pending changes at once. */
    batch?(changes: ChangeSet<T>): Promise<ChangeSet<T>>;
}

// ─── parameterMap helpers ─────────────────────────────────────

export type ParameterMap = (request: DataRequest) => Record<string, string | number | boolean>;

// ─── REST Transport ───────────────────────────────────────────

export interface RestTransportOptions<T> {
    /** Base URL for the resource (e.g. '/api/users'). */
    baseUrl: string;
    /** Custom fetch function. Default: global fetch. */
    fetchFn?: typeof fetch;
    /** Custom headers. */
    headers?: Record<string, string> | (() => Record<string, string>);
    /** Custom parameter mapping. Default: page, pageSize, sort, filter as query params. */
    parameterMap?: ParameterMap;
    /** Field used as the unique ID. Default: 'id'. */
    idField?: keyof T & string;
    /** Parse the server response into { data, total }. */
    parseResponse?: (json: unknown) => DataResponse<T>;
}

function defaultParameterMap(request: DataRequest): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {
        page: request.page,
        pageSize: request.pageSize,
    };
    if (request.sort.length > 0) {
        params.sort = request.sort.map(s => `${s.field} ${s.dir}`).join(',');
    }
    if (request.filter.length > 0) {
        params.filter = JSON.stringify(request.filter);
    }
    if (request.params) {
        for (const [k, v] of Object.entries(request.params)) {
            if (v !== undefined && v !== null) params[k] = String(v);
        }
    }
    return params;
}

function buildUrl(base: string, params: Record<string, string | number | boolean>): string {
    const url = new URL(base, 'http://localhost');
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
    }
    // Return path + query (relative)
    return base + url.search;
}

function resolveHeaders(h?: Record<string, string> | (() => Record<string, string>)): Record<string, string> {
    if (!h) return {};
    return typeof h === 'function' ? h() : h;
}

/**
 * A {@link createDataSource} backend that talks to a REST API: paging, sorting, filtering and CRUD
 * over `fetch`.
 *
 * The two hooks that matter are `parameterMap`, which turns the grid's descriptors into whatever
 * query string your server expects, and `parseResponse`, which reads its answer. Without them it
 * assumes the common convention — `{ data, total }`, or a bare array with `total: -1` meaning
 * unknown — and that convention is the only thing to change when a server disagrees.
 *
 * `total: -1` is not an error: it means the server did not say how many rows exist, and the grid
 * shows a next-page control instead of a page count.
 */
export function restTransport<T extends Record<string, unknown>>(options: RestTransportOptions<T>): IDataTransport<T> {
    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    const idField = options.idField ?? 'id' as keyof T & string;
    const paramMap = options.parameterMap ?? defaultParameterMap;

    function parseDefault(json: unknown): DataResponse<T> {
        if (options.parseResponse) return options.parseResponse(json);
        // Convention: { data: T[], total: number } or plain array
        if (Array.isArray(json)) return { data: json as T[], total: -1 };
        const obj = json as Record<string, unknown>;
        return {
            data: (obj.data ?? obj.items ?? obj.results ?? []) as T[],
            total: typeof obj.total === 'number' ? obj.total : (typeof obj.count === 'number' ? obj.count : -1),
        };
    }

    async function read(request: DataRequest): Promise<DataResponse<T>> {
        const params = paramMap(request);
        const url = buildUrl(options.baseUrl, params);
        const res = await fetchFn(url, {
            headers: { 'Accept': 'application/json', ...resolveHeaders(options.headers) },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return parseDefault(await res.json());
    }

    async function create(item: Partial<T>): Promise<T> {
        const res = await fetchFn(options.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...resolveHeaders(options.headers) },
            body: JSON.stringify(item),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return await res.json() as T;
    }

    async function update(item: T): Promise<T> {
        const id = item[idField];
        const res = await fetchFn(`${options.baseUrl}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...resolveHeaders(options.headers) },
            body: JSON.stringify(item),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return await res.json() as T;
    }

    async function destroy(item: T): Promise<void> {
        const id = item[idField];
        const res = await fetchFn(`${options.baseUrl}/${id}`, {
            method: 'DELETE',
            headers: resolveHeaders(options.headers),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    async function patch(id: unknown, partial: Partial<T>): Promise<T> {
        const res = await fetchFn(`${options.baseUrl}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...resolveHeaders(options.headers) },
            body: JSON.stringify(partial),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return await res.json() as T;
    }

    async function batchSync(changes: ChangeSet<T>): Promise<ChangeSet<T>> {
        // Phase ordering: destroy → update → add. Deleting first frees unique
        // constraints (e.g. a unique key reused by a new row) and avoids FK
        // conflicts that parallel Promise.all could trigger non-deterministically.
        // Within a phase ops run in parallel (independent), but phases are awaited
        // sequentially. allSettled preserves succeeded ops on partial failure:
        // results contain what actually went through, and the first error is
        // re-thrown afterward so the caller doesn't silently drop pending state.
        const results: ChangeSet<T> = { added: [], updated: [], removed: [] };
        // INPUT items that were actually persisted. On partial failure this is attached to
        // the thrown error so the caller can prune them from the pending set and NOT re-send
        // them on retry (duplicate creates otherwise).
        const appliedInputs = new Set<unknown>();
        let firstError: unknown;

        async function runPhase<I>(
            items: I[],
            op: (item: I) => Promise<void>,
        ): Promise<void> {
            const settled = await Promise.allSettled(items.map(op));
            for (const s of settled) {
                if (s.status === 'rejected' && firstError === undefined) firstError = s.reason;
            }
        }

        await runPhase(changes.removed, async (item) => {
            await destroy(item);
            results.removed.push(item);
            appliedInputs.add(item);
        });
        await runPhase(changes.updated, async (item) => {
            results.updated.push(await update(item));
            appliedInputs.add(item);
        });
        await runPhase(changes.added, async (item) => {
            results.added.push(await create(item));
            appliedInputs.add(item);
        });

        if (firstError !== undefined) {
            const err = firstError instanceof Error ? firstError : new Error(String(firstError));
            (err as { appliedInputs?: Set<unknown> }).appliedInputs = appliedInputs;
            throw err;
        }
        return results;
    }

    return { read, create, update, patch, destroy, batch: batchSync };
}
