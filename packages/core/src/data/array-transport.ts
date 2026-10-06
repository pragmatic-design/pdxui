// In-memory transport for DataSource — client-side sort, filter, page, group, CRUD.
// Usage: createDataSource([...]) or createDataSource({ data: [...] })

import type { IDataTransport, DataRequest, DataResponse, ChangeSet } from './transport';
import { matchesFilters, clientSort, clientGroup } from './data-utils';
import type { GroupResult } from './data-utils';

export interface ArrayTransportOptions<T> {
    /** Initial data array. The transport operates on a copy. */
    data: T[];
    /** Field used as unique ID. Default: 'id'. */
    idField?: string;
}

let _autoId = 0;

/**
 * A {@link createDataSource} backend over an in-memory array: sorting, filtering, paging, grouping
 * and CRUD, all client-side.
 *
 * It works on a COPY of the array it is given, so the caller's data is never mutated behind its
 * back. Use it when the whole dataset is already in the browser — a picker's options, a settings
 * table — and note the ceiling: everything is O(n) per operation, so a few thousand rows is the
 * point where a server-side transport earns its keep.
 */
export function arrayTransport<T extends Record<string, unknown>>(
    options: ArrayTransportOptions<T>,
): IDataTransport<T> {
    const idField = options.idField ?? 'id';
    // Work on a mutable copy
    let _items = options.data.slice();

    async function read(request: DataRequest): Promise<DataResponse<T>> {
        // 1. Filter — only when filter descriptors are present.
        // (Previously checked matchesFilters.length, the function arity, which is
        //  always 2 → filter ran even with no descriptors.)
        let result = request.filter && request.filter.length > 0
            ? _items.filter(item => matchesFilters(item, request.filter))
            : _items.slice();

        const total = result.length;

        // 2. Sort
        if (request.sort.length > 0) {
            result = clientSort(result, request.sort);
        }

        // 3. Group (if requested)
        let groups: GroupResult<T>[] | undefined;
        if (request.group && request.group.length > 0) {
            groups = clientGroup(result, request.group);
        }

        // 4. Page (skip if pageSize = 0)
        if (request.pageSize > 0) {
            const start = (request.page - 1) * request.pageSize;
            result = result.slice(start, start + request.pageSize);
        }

        return { data: result, total, groups };
    }

    async function create(item: Partial<T>): Promise<T> {
        const newItem = { ...item } as T;
        if (!(idField in newItem) || newItem[idField] == null) {
            (newItem as Record<string, unknown>)[idField] = `__auto_${++_autoId}`;
        }
        _items.push(newItem);
        return newItem;
    }

    async function update(item: T): Promise<T> {
        const id = item[idField];
        const idx = _items.findIndex(i => i[idField] === id);
        if (idx >= 0) _items[idx] = item;
        return item;
    }

    async function patch(id: unknown, partial: Partial<T>): Promise<T> {
        const idx = _items.findIndex(i => i[idField] === id);
        if (idx < 0) throw new Error(`Item not found: ${id}`);
        _items[idx] = { ..._items[idx], ...partial };
        return _items[idx];
    }

    async function destroy(item: T): Promise<void> {
        const id = item[idField];
        _items = _items.filter(i => i[idField] !== id);
    }

    async function batchSync(changes: ChangeSet<T>): Promise<ChangeSet<T>> {
        const results: ChangeSet<T> = { added: [], updated: [], removed: [] };
        for (const item of changes.removed) { await destroy(item); results.removed.push(item); }
        for (const item of changes.updated) { results.updated.push(await update(item)); }
        for (const item of changes.added) { results.added.push(await create(item)); }
        return results;
    }

    return { read, create, update, patch, destroy, batch: batchSync };
}
