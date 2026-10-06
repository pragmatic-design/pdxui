import { describe, it, expect, vi } from 'vitest';
import { createDataSource } from '../src/data/data-source';
import { arrayTransport } from '../src/data/array-transport';
import { matchesFilters, clientSort, clientGroup, computeDiff } from '../src/data/data-utils';
import { opsForType, toFormFields } from '../src/data/field-definition';
import type { IDataTransport, DataRequest, DataResponse } from '../src/data/transport';

function mockTransport<T extends Record<string, unknown>>(data: T[], total?: number): IDataTransport<T> {
    return {
        read: vi.fn(async (req: DataRequest): Promise<DataResponse<T>> => {
            let filtered = data;
            if (req.filter?.length) {
                const f = req.filter[0];
                if ('operator' in f && f.operator === 'contains') {
                    filtered = filtered.filter(item => String(item[f.field]).toLowerCase().includes(String(f.value).toLowerCase()));
                }
            }
            if (req.sort?.length) {
                const s = req.sort[0];
                filtered = [...filtered].sort((a, b) => {
                    const av = a[s.field] as number | string, bv = b[s.field] as number | string;
                    if (av < bv) return s.dir === 'asc' ? -1 : 1;
                    if (av > bv) return s.dir === 'asc' ? 1 : -1;
                    return 0;
                });
            }
            const start = (req.page - 1) * req.pageSize;
            return { data: filtered.slice(start, start + req.pageSize), total: total ?? filtered.length };
        }),
        create: vi.fn(async (item) => item as T),
        update: vi.fn(async (item) => item),
        destroy: vi.fn(async () => {}),
    };
}

const users = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}`, email: `u${i + 1}@t.com` }));

describe('DataSource', () => {
    it('loads data on creation (autoLoad)', async () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 10 });
        await vi.waitFor(() => expect(ds.isLoading()).toBe(false), { timeout: 500 });
        expect(ds.data().length).toBe(10);
        expect(ds.total()).toBe(25);
        expect(ds.page()).toBe(1);
        ds.dispose();
    });

    it('paginates correctly', async () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 10 });
        await vi.waitFor(() => expect(ds.data().length).toBe(10));
        ds.setPage(2);
        await vi.waitFor(() => expect(ds.page()).toBe(2));
        expect(ds.data().length).toBe(10);
        expect(ds.data()[0].id).toBe(11);
        ds.setPage(3);
        await vi.waitFor(() => expect(ds.page()).toBe(3));
        expect(ds.data().length).toBe(5);
        ds.dispose();
    });

    it('sorts via transport', async () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 5 });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.setSort([{ field: 'name', dir: 'desc' }]);
        await vi.waitFor(() => expect(ds.sort()[0]?.dir).toBe('desc'));
        expect(ds.data()[0].name).toBe('User 9'); // "User 9" > "User 8" alphabetically
        ds.dispose();
    });

    it('filters via transport', async () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 50 });
        await vi.waitFor(() => expect(ds.data().length).toBe(25));
        ds.setFilter([{ field: 'name', operator: 'contains', value: 'User 1' }]);
        await vi.waitFor(() => expect(ds.filter().length).toBe(1));
        // "User 1", "User 10"-"User 19" = 11 items
        expect(ds.data().length).toBe(11);
        expect(ds.page()).toBe(1);
        ds.dispose();
    });

    it('tracks added items', async () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 10 });
        await vi.waitFor(() => expect(ds.data().length).toBe(10));
        ds.add({ id: 100, name: 'New', email: 'new@t.com' });
        expect(ds.hasChanges()).toBe(true);
        expect(ds.changes().added.length).toBe(1);
        expect(ds.data().length).toBe(11); // 10 server + 1 added
        ds.dispose();
    });

    it('filters locally added items against active filter', async () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 50 });
        await vi.waitFor(() => expect(ds.data().length).toBe(25));
        ds.setFilter([{ field: 'name', operator: 'contains', value: 'User 1' }]);
        await vi.waitFor(() => expect(ds.data().length).toBe(11));
        // Add item that doesn't match filter
        ds.add({ id: 200, name: 'NoMatch', email: 'x@t.com' });
        expect(ds.data().length).toBe(11); // NOT 12
        // Add item that matches filter
        ds.add({ id: 201, name: 'User 1XX', email: 'x@t.com' });
        expect(ds.data().length).toBe(12); // matches "User 1"
        ds.dispose();
    });

    it('cancelChanges discards local changes', async () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 10 });
        await vi.waitFor(() => expect(ds.data().length).toBe(10));
        ds.add({ id: 100, name: 'New', email: 'x@t.com' });
        expect(ds.data().length).toBe(11);
        ds.cancelChanges();
        expect(ds.data().length).toBe(10);
        expect(ds.hasChanges()).toBe(false);
        ds.dispose();
    });

    it('skips autoLoad when autoLoad=false', () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 10, autoLoad: false });
        expect(transport.read).not.toHaveBeenCalled();
        expect(ds.data().length).toBe(0);
        ds.dispose();
    });

    it('computes totalPages correctly', async () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 10 });
        await vi.waitFor(() => expect(ds.total()).toBe(25));
        expect(ds.totalPages()).toBe(3);
        ds.dispose();
    });

    // ─── v2: Array overload ───────────────────────

    it('creates from array (shorthand)', async () => {
        const ds = createDataSource([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 3, name: 'Charlie' },
        ]);
        await vi.waitFor(() => expect(ds.data().length).toBe(3));
        expect(ds.total()).toBe(3);
        ds.dispose();
    });

    it('creates from options.data (inline array)', async () => {
        const ds = createDataSource({
            data: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
            pageSize: 1,
        });
        await vi.waitFor(() => expect(ds.data().length).toBe(1));
        expect(ds.total()).toBe(2);
        expect(ds.totalPages()).toBe(2);
        ds.dispose();
    });

    // ─── v2: Client-side sort/filter on array ─────

    it('sorts array data client-side', async () => {
        const ds = createDataSource([
            { id: 1, name: 'Charlie' },
            { id: 2, name: 'Alice' },
            { id: 3, name: 'Bob' },
        ]);
        await vi.waitFor(() => expect(ds.data().length).toBe(3));
        ds.setSort([{ field: 'name', dir: 'asc' }]);
        await vi.waitFor(() => expect(ds.data()[0].name).toBe('Alice'));
        expect(ds.data()[1].name).toBe('Bob');
        expect(ds.data()[2].name).toBe('Charlie');
        ds.dispose();
    });

    it('filters array data client-side', async () => {
        const ds = createDataSource([
            { id: 1, name: 'Alice', role: 'admin' },
            { id: 2, name: 'Bob', role: 'user' },
            { id: 3, name: 'Charlie', role: 'admin' },
        ]);
        await vi.waitFor(() => expect(ds.data().length).toBe(3));
        ds.setFilter([{ field: 'role', operator: 'eq', value: 'admin' }]);
        await vi.waitFor(() => expect(ds.data().length).toBe(2));
        expect(ds.data().every(u => u.role === 'admin')).toBe(true);
        ds.dispose();
    });

    // ─── v2: Patch ────────────────────────────────

    it('patches an item (partial update)', async () => {
        const ds = createDataSource([
            { id: 1, name: 'Alice', email: 'a@t.com' },
            { id: 2, name: 'Bob', email: 'b@t.com' },
        ]);
        await vi.waitFor(() => expect(ds.data().length).toBe(2));
        ds.patch(1, { name: 'Alice Updated' });
        expect(ds.hasChanges()).toBe(true);
        expect(ds.getById(1)!.name).toBe('Alice Updated');
        expect(ds.getById(1)!.email).toBe('a@t.com'); // untouched
        ds.dispose();
    });

    it('getById returns item from view data', async () => {
        const ds = createDataSource([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
        ]);
        await vi.waitFor(() => expect(ds.data().length).toBe(2));
        expect(ds.getById(1)!.name).toBe('Alice');
        expect(ds.getById(99)).toBeUndefined();
        ds.dispose();
    });

    // ─── v2: Grouping ─────────────────────────────

    it('groups array data client-side', async () => {
        const ds = createDataSource({
            data: [
                { id: 1, name: 'Alice', dept: 'Engineering' },
                { id: 2, name: 'Bob', dept: 'Sales' },
                { id: 3, name: 'Charlie', dept: 'Engineering' },
            ],
        });
        await vi.waitFor(() => expect(ds.data().length).toBe(3));
        ds.setGroup([{ field: 'dept' }]);
        await vi.waitFor(() => expect(ds.groups()).toBeDefined());
        const groups = ds.groups()!;
        expect(groups.length).toBe(2);
        const eng = groups.find(g => g.value === 'Engineering')!;
        expect((eng.items as any[]).length).toBe(2);
        ds.dispose();
    });

    // ─── v2: AutoSync ─────────────────────────────

    // ─── v2: Infinite scroll ──────────────────────

    it('loadMore accumulates pages', async () => {
        const items = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
        const ds = createDataSource({ data: items, pageSize: 5 });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        expect(ds.hasMore()).toBe(true);
        expect(ds.loadedCount()).toBe(5);

        await ds.loadMore();
        expect(ds.data().length).toBe(10); // 5 + 5 accumulated
        expect(ds.loadedCount()).toBe(10);
        expect(ds.hasMore()).toBe(true);

        await ds.loadMore();
        expect(ds.data().length).toBe(12); // 10 + 2
        expect(ds.hasMore()).toBe(false);
        ds.dispose();
    });

    it('reset clears accumulated data', async () => {
        const items = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
        const ds = createDataSource({ data: items, pageSize: 3 });
        await vi.waitFor(() => expect(ds.data().length).toBe(3));
        await ds.loadMore();
        expect(ds.data().length).toBe(6);
        await ds.reset();
        expect(ds.data().length).toBe(3); // back to page 1
        expect(ds.page()).toBe(1);
        ds.dispose();
    });

    // Changing the query (sort) after loadMore must leave append mode and not
    // duplicate rows by appending page 1 to the accumulated pages.
    it('setSort after loadMore does not duplicate rows', async () => {
        const items = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
        const ds = createDataSource({ data: items, pageSize: 5 });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        await ds.loadMore();
        expect(ds.data().length).toBe(10);

        ds.setSort([{ field: 'id', dir: 'desc' }]);
        await vi.waitFor(() => expect(ds.sort()[0]?.dir).toBe('desc'));
        // Back to a single (page-1) view, not 10+5 accumulated
        expect(ds.data().length).toBe(5);
        const ids = ds.data().map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length); // no duplicates
        ds.dispose();
    });

    // Two overlapping syncs must not send the same create twice.
    it('concurrent sync() does not duplicate creates', async () => {
        const created: unknown[] = [];
        let resolveCreate!: () => void;
        const transport: IDataTransport<{ id: number; name: string }> = {
            read: vi.fn(async () => ({ data: [], total: 0 })),
            create: vi.fn(async (item) => {
                created.push(item);
                await new Promise<void>(r => { resolveCreate = r; });
                return item;
            }),
            update: vi.fn(async (i) => i),
            destroy: vi.fn(async () => {}),
        };
        const ds = createDataSource({ transport, pageSize: 10 });
        await vi.waitFor(() => expect(ds.isLoading()).toBe(false));

        ds.add({ id: 100, name: 'New' });
        const s1 = ds.sync();     // starts, blocks in create
        const s2 = ds.sync();     // must NOT start a second create for the same item
        resolveCreate();          // let the first create finish
        await Promise.all([s1, s2]);

        expect(created.length).toBe(1); // exactly one create, not two
        ds.dispose();
    });

    // On a partial batch failure, ops that persisted must not be re-sent on retry.
    it('batch partial failure does not re-send succeeded ops', async () => {
        const createdIds: number[] = [];
        const transport: IDataTransport<{ id: number; name: string }> = {
            read: vi.fn(async () => ({ data: [], total: 0 })),
            update: vi.fn(async (i) => i),
            destroy: vi.fn(async () => {}),
            // batch: succeed for id 1, fail for id 2
            batch: vi.fn(async (cs) => {
                const applied = new Set<unknown>();
                const results = { added: [] as unknown[], updated: [], removed: [] };
                let firstError: unknown;
                for (const item of cs.added) {
                    if ((item as { id: number }).id === 2) { firstError = new Error('boom'); continue; }
                    createdIds.push((item as { id: number }).id);
                    results.added.push(item); applied.add(item);
                }
                if (firstError) {
                    (firstError as { appliedInputs?: Set<unknown> }).appliedInputs = applied;
                    throw firstError;
                }
                return results as never;
            }),
        };
        const ds = createDataSource({ transport, pageSize: 10 });
        await vi.waitFor(() => expect(ds.isLoading()).toBe(false));

        ds.add({ id: 1, name: 'A' });
        ds.add({ id: 2, name: 'B' });
        await ds.sync().catch(() => {}); // partial failure (id 2)
        expect(createdIds).toEqual([1]);

        // Retry: id 1 already persisted must NOT be created again; only id 2 retried.
        (transport.batch as unknown as { mockClear: () => void }).mockClear?.();
        createdIds.length = 0;
        await ds.sync().catch(() => {});
        expect(createdIds).not.toContain(1); // no duplicate create for the succeeded op
        ds.dispose();
    });

    // ─── v2: getAllIds ─────────────────────────────

    it('getAllIds returns all IDs matching current filter', async () => {
        const items = [
            { id: 1, name: 'Alice', role: 'admin' },
            { id: 2, name: 'Bob', role: 'user' },
            { id: 3, name: 'Charlie', role: 'admin' },
        ];
        const ds = createDataSource({ data: items, pageSize: 2 });
        await vi.waitFor(() => expect(ds.data().length).toBe(2));

        // All IDs (ignores pagination)
        const allIds = await ds.getAllIds();
        expect(allIds).toEqual([1, 2, 3]);

        // With filter
        ds.setFilter([{ field: 'role', operator: 'eq', value: 'admin' }]);
        await vi.waitFor(() => expect(ds.data().length).toBeLessThanOrEqual(2));
        const adminIds = await ds.getAllIds();
        expect(adminIds).toEqual([1, 3]);
        ds.dispose();
    });

    // ─── v2: AutoSync ─────────────────────────────

    it('auto-syncs changes after debounce', async () => {
        const transport = mockTransport(users);
        transport.batch = vi.fn(async (cs) => cs);
        const ds = createDataSource({ transport, pageSize: 10, autoSync: { debounceMs: 50 } });
        await vi.waitFor(() => expect(ds.data().length).toBe(10));
        ds.add({ id: 100, name: 'New', email: 'new@t.com' });
        expect(transport.batch).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(transport.batch).toHaveBeenCalled(), { timeout: 200 });
        ds.dispose();
    });
});

// ─── Selection tests ──────────────────────────────────────

describe('DataSource Selection', () => {
    const items = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
        { id: 4, name: 'Diana' },
        { id: 5, name: 'Eve' },
    ];

    // ── Single selection ──────────────────────────

    it('single mode: select one item', async () => {
        const ds = createDataSource({ data: items, selection: { mode: 'single' } });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.select(2);
        expect(ds.selected().size).toBe(1);
        expect(ds.isSelected(2)).toBe(true);
        expect(ds.isSelected(1)).toBe(false);
        ds.dispose();
    });

    it('single mode: selecting another replaces previous', async () => {
        const ds = createDataSource({ data: items, selection: { mode: 'single' } });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.select(1);
        ds.select(3);
        expect(ds.selected().size).toBe(1);
        expect(ds.isSelected(1)).toBe(false);
        expect(ds.isSelected(3)).toBe(true);
        ds.dispose();
    });

    it('single mode: deselect clears', async () => {
        const ds = createDataSource({ data: items, selection: { mode: 'single' } });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.select(2);
        ds.deselect(2);
        expect(ds.selected().size).toBe(0);
        ds.dispose();
    });

    // ── Multiple selection ────────────────────────

    it('multiple mode: select multiple items', async () => {
        const ds = createDataSource({ data: items, selection: { mode: 'multiple' } });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.select(1);
        ds.select(3);
        ds.select(5);
        expect(ds.selected().size).toBe(3);
        expect(ds.isSelected(1)).toBe(true);
        expect(ds.isSelected(2)).toBe(false);
        expect(ds.isSelected(3)).toBe(true);
        ds.dispose();
    });

    it('multiple mode: toggle deselects if already selected', async () => {
        const ds = createDataSource({ data: items, selection: { mode: 'multiple' } });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.select(1);
        ds.select(2);
        ds.toggleSelect(1);
        expect(ds.isSelected(1)).toBe(false);
        expect(ds.isSelected(2)).toBe(true);
        expect(ds.selected().size).toBe(1);
        ds.dispose();
    });

    it('multiple mode: deselectAll clears all', async () => {
        const ds = createDataSource({ data: items, selection: { mode: 'multiple' } });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.select(1);
        ds.select(2);
        ds.select(3);
        ds.deselectAll();
        expect(ds.selected().size).toBe(0);
        ds.dispose();
    });

    // ── selectedItems / selectedCount ─────────────

    it('selectedItems resolves IDs to full items', async () => {
        const ds = createDataSource({ data: items, selection: { mode: 'multiple' } });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.select(1);
        ds.select(4);
        const selected = ds.selectedItems();
        expect(selected.length).toBe(2);
        expect(selected.map(i => i.name)).toContain('Alice');
        expect(selected.map(i => i.name)).toContain('Diana');
        ds.dispose();
    });

    it('selectedCount tracks total selected', async () => {
        const ds = createDataSource({ data: items, selection: { mode: 'multiple' } });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        expect(ds.selectedCount()).toBe(0);
        ds.select(1);
        ds.select(2);
        expect(ds.selectedCount()).toBe(2);
        ds.deselect(1);
        expect(ds.selectedCount()).toBe(1);
        ds.dispose();
    });

    // ── selectAll (cross-page) ────────────────────

    it('selectAll selects all items matching current filter', async () => {
        const ds = createDataSource({
            data: items,
            pageSize: 2,
            selection: { mode: 'multiple' },
        });
        await vi.waitFor(() => expect(ds.data().length).toBe(2)); // page 1: only 2 items visible
        await ds.selectAll();
        expect(ds.selectedCount()).toBe(5); // all 5 selected, not just visible 2
        ds.dispose();
    });

    it('selectAll with active filter selects only matching', async () => {
        const richItems = [
            { id: 1, name: 'Alice', role: 'admin' },
            { id: 2, name: 'Bob', role: 'user' },
            { id: 3, name: 'Charlie', role: 'admin' },
            { id: 4, name: 'Diana', role: 'user' },
        ];
        const ds = createDataSource({
            data: richItems,
            selection: { mode: 'multiple' },
        });
        await vi.waitFor(() => expect(ds.data().length).toBe(4));
        ds.setFilter([{ field: 'role', operator: 'eq', value: 'admin' }]);
        await vi.waitFor(() => expect(ds.data().length).toBe(2));
        await ds.selectAll();
        expect(ds.selectedCount()).toBe(2);
        expect(ds.isSelected(1)).toBe(true);
        expect(ds.isSelected(3)).toBe(true);
        expect(ds.isSelected(2)).toBe(false);
        ds.dispose();
    });

    // ── Selection persistence across pages ────────

    it('selection persists across page changes', async () => {
        const ds = createDataSource({
            data: items,
            pageSize: 2,
            selection: { mode: 'multiple' },
        });
        await vi.waitFor(() => expect(ds.data().length).toBe(2));
        // Select item on page 1
        ds.select(1);
        // Go to page 2
        ds.setPage(2);
        await vi.waitFor(() => expect(ds.page()).toBe(2));
        // Select item on page 2
        ds.select(3);
        // Both still selected
        expect(ds.selectedCount()).toBe(2);
        expect(ds.isSelected(1)).toBe(true);
        expect(ds.isSelected(3)).toBe(true);
        // Go back to page 1 — selection still there
        ds.setPage(1);
        await vi.waitFor(() => expect(ds.page()).toBe(1));
        expect(ds.isSelected(1)).toBe(true);
        expect(ds.selectedCount()).toBe(2);
        ds.dispose();
    });

    // ── No selection mode (default) ───────────────

    it('without selection option, selection signals are inert', async () => {
        const ds = createDataSource({ data: items });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        expect(ds.selected().size).toBe(0);
        expect(ds.selectedCount()).toBe(0);
        expect(ds.selectedItems().length).toBe(0);
        // select/deselect are no-ops
        ds.select(1);
        expect(ds.selected().size).toBe(0);
        expect(ds.isSelected(1)).toBe(false);
        ds.dispose();
    });

    // ── Selection + remove interaction ────────────

    it('removing a selected item updates selectedItems', async () => {
        const ds = createDataSource({
            data: items,
            selection: { mode: 'multiple' },
        });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.select(2);
        ds.select(3);
        expect(ds.selectedItems().length).toBe(2);
        // Remove item 2
        ds.remove(items[1]); // Bob (id:2)
        // selectedItems should now only resolve id:3 from view data
        expect(ds.selectedItems().length).toBe(1);
        expect(ds.selectedItems()[0].name).toBe('Charlie');
        // But selectedCount still shows 2 (ID still in set)
        expect(ds.selectedCount()).toBe(2);
        ds.dispose();
    });

    // ── clearSelection ────────────────────────────

    it('clearSelection clears selection', async () => {
        const ds = createDataSource({
            data: items,
            selection: { mode: 'multiple' },
        });
        await vi.waitFor(() => expect(ds.data().length).toBe(5));
        ds.select(1);
        ds.select(2);
        ds.select(3);
        expect(ds.selectedCount()).toBe(3);
        ds.clearSelection();
        expect(ds.selectedCount()).toBe(0);
        ds.dispose();
    });
});

// ─── data-utils tests ─────────────────────────────────────

describe('data-utils', () => {
    it('matchesFilters with composite AND/OR', () => {
        const item = { id: 1, name: 'Alice', age: 30 };
        expect(matchesFilters(item, [
            { logic: 'or', filters: [
                { field: 'name', operator: 'eq', value: 'Bob' },
                { field: 'age', operator: 'gte', value: 25 },
            ]},
        ])).toBe(true); // age >= 25 matches

        expect(matchesFilters(item, [
            { logic: 'and', filters: [
                { field: 'name', operator: 'eq', value: 'Alice' },
                { field: 'age', operator: 'lt', value: 20 },
            ]},
        ])).toBe(false); // age < 20 fails
    });

    it('clientSort multi-field', () => {
        const items = [
            { id: 1, dept: 'B', name: 'Charlie' },
            { id: 2, dept: 'A', name: 'Bob' },
            { id: 3, dept: 'A', name: 'Alice' },
        ];
        const sorted = clientSort(items, [
            { field: 'dept', dir: 'asc' },
            { field: 'name', dir: 'asc' },
        ]);
        expect(sorted[0].name).toBe('Alice');
        expect(sorted[1].name).toBe('Bob');
        expect(sorted[2].name).toBe('Charlie');
    });

    it('clientGroup with aggregates', () => {
        const items = [
            { id: 1, dept: 'Eng', salary: 100 },
            { id: 2, dept: 'Sales', salary: 80 },
            { id: 3, dept: 'Eng', salary: 120 },
        ];
        const groups = clientGroup(items, [{
            field: 'dept',
            aggregates: [{ field: 'salary', aggregate: 'sum' }],
        }]);
        expect(groups.length).toBe(2);
        const eng = groups.find(g => g.value === 'Eng')!;
        expect(eng.aggregates!['salary_sum']).toBe(220);
    });

    it('computeDiff detects changed fields', () => {
        const original = { id: 1, name: 'Alice', email: 'a@t.com' };
        const updated = { id: 1, name: 'Alice Updated', email: 'a@t.com' };
        const diff = computeDiff(original, updated);
        expect(diff).toEqual({ name: 'Alice Updated' });
    });

    it('computeDiff returns null if identical', () => {
        const item = { id: 1, name: 'Alice' };
        expect(computeDiff(item, { ...item })).toBeNull();
    });

    it('matchesFilter in/notin — set membership, loose string match', () => {
        const item = { id: 1, cat: 2 }; // valore numerico
        // values from the UI arrive as strings: '2' has to match 2
        expect(matchesFilters(item, [{ field: 'cat', operator: 'in', value: ['1', '2'] }])).toBe(true);
        expect(matchesFilters(item, [{ field: 'cat', operator: 'in', value: ['3', '4'] }])).toBe(false);
        expect(matchesFilters(item, [{ field: 'cat', operator: 'notin', value: ['3', '4'] }])).toBe(true);
        expect(matchesFilters(item, [{ field: 'cat', operator: 'notin', value: ['1', '2'] }])).toBe(false);
        // a non-array target → no constraint
        expect(matchesFilters(item, [{ field: 'cat', operator: 'notin', value: 2 }])).toBe(true);
    });

    it('matchesFilter between — an inclusive range, a null bound = open', () => {
        const f = (price: number, range: unknown) =>
            matchesFilters({ id: 1, price }, [{ field: 'price', operator: 'between', value: range }]);
        expect(f(50, [10, 100])).toBe(true);
        expect(f(10, [10, 100])).toBe(true);   // inclusivo
        expect(f(100, [10, 100])).toBe(true);  // inclusivo
        expect(f(5, [10, 100])).toBe(false);
        expect(f(150, [10, 100])).toBe(false);
        expect(f(150, [10, null])).toBe(true);  // max open
        expect(f(5, [null, 100])).toBe(true);   // min open
    });

    it('matchesFilter relative date — today/yesterday/last7days/thismonth', () => {
        const now = new Date();
        // Local dates at noon, to stay clear of the midnight edge.
        const day = (off: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + off, 12);
        const f = (d: Date, op: string) =>
            matchesFilters({ id: 1, d }, [{ field: 'd', operator: op as any, value: null }]);
        expect(f(day(0), 'today')).toBe(true);
        expect(f(day(-1), 'today')).toBe(false);
        expect(f(day(-1), 'yesterday')).toBe(true);
        expect(f(day(0), 'yesterday')).toBe(false);
        expect(f(day(-3), 'last7days')).toBe(true);
        expect(f(day(-10), 'last7days')).toBe(false);
        expect(f(day(0), 'thismonth')).toBe(true);
        expect(f(day(-40), 'thismonth')).toBe(false);
    });
});

describe('distinctValues (Set filter)', () => {
    it('returns the distinct values of a field (null included once)', async () => {
        const ds = createDataSource({
            data: [
                { id: 1, cat: 'A' }, { id: 2, cat: 'B' }, { id: 3, cat: 'A' },
                { id: 4, cat: null }, { id: 5, cat: 'B' }, { id: 6, cat: null },
            ],
            pageSize: 2,
        });
        const vals = await ds.distinctValues('cat');
        expect(vals.filter(v => v != null).sort()).toEqual(['A', 'B']);
        expect(vals.filter(v => v == null).length).toBe(1); // null deduplicato
    });
});

describe('toFormFields (unified field def → form)', () => {
    it('passes optionsSource to the form (server-side autocomplete)', async () => {
        const loader = async (q: string) => [{ label: 'X' + q, value: 1 }];
        const fields = toFormFields([
            { field: 'city', label: 'City', type: 'enum', optionsSource: loader },
        ]);
        expect(fields[0].optionsSource).toBe(loader);
        expect(typeof fields[0].optionsSource).toBe('function');
    });
});

describe('opsForType', () => {
    it('enum → set operators (in/notin), not text', () => {
        expect(opsForType('enum')).toEqual(['in', 'notin', 'isnull', 'isnotnull']);
    });
    it('number/date/text invariati', () => {
        expect(opsForType('number')).toContain('gte');
        expect(opsForType('text')).toContain('contains');
        expect(opsForType('enum')).not.toContain('contains');
    });
    it('number and date include both isnull and isnotnull', () => {
        for (const t of ['number', 'currency', 'date'] as const) {
            expect(opsForType(t)).toContain('isnull');
            expect(opsForType(t)).toContain('isnotnull');
        }
    });
});

// ─── arrayTransport tests ─────────────────────────────────

describe('arrayTransport', () => {
    it('reads with filter and sort', async () => {
        const t = arrayTransport({
            data: [
                { id: 1, name: 'Charlie' },
                { id: 2, name: 'Alice' },
                { id: 3, name: 'Bob' },
            ],
        });
        const result = await t.read({
            page: 1, pageSize: 10,
            sort: [{ field: 'name', dir: 'asc' }],
            filter: [],
        });
        expect(result.data[0].name).toBe('Alice');
        expect(result.total).toBe(3);
    });

    it('CRUD operations modify internal array', async () => {
        const t = arrayTransport({
            data: [{ id: 1, name: 'Alice' }],
        });

        // Create
        await t.create!({ id: 2, name: 'Bob' });
        let result = await t.read({ page: 1, pageSize: 10, sort: [], filter: [] });
        expect(result.total).toBe(2);

        // Update
        await t.update!({ id: 1, name: 'Alice Updated' } as any);
        result = await t.read({ page: 1, pageSize: 10, sort: [], filter: [] });
        expect(result.data.find(i => i.id === 1)!.name).toBe('Alice Updated');

        // Patch
        await t.patch!(2, { name: 'Bob Patched' });
        result = await t.read({ page: 1, pageSize: 10, sort: [], filter: [] });
        expect(result.data.find(i => i.id === 2)!.name).toBe('Bob Patched');

        // Destroy
        await t.destroy!({ id: 1, name: 'Alice Updated' } as any);
        result = await t.read({ page: 1, pageSize: 10, sort: [], filter: [] });
        expect(result.total).toBe(1);
        expect(result.data[0].id).toBe(2);
    });

    it('paginates correctly', async () => {
        const items = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
        const t = arrayTransport({ data: items });
        const p1 = await t.read({ page: 1, pageSize: 5, sort: [], filter: [] });
        expect(p1.data.length).toBe(5);
        expect(p1.total).toBe(15);
        const p3 = await t.read({ page: 3, pageSize: 5, sort: [], filter: [] });
        expect(p3.data.length).toBe(5);
        expect(p3.data[0].id).toBe(11);
    });

    it('groups with aggregates', async () => {
        const t = arrayTransport({
            data: [
                { id: 1, dept: 'A', val: 10 },
                { id: 2, dept: 'B', val: 20 },
                { id: 3, dept: 'A', val: 30 },
            ],
        });
        const result = await t.read({
            page: 1, pageSize: 0, sort: [], filter: [],
            group: [{ field: 'dept', aggregates: [{ field: 'val', aggregate: 'sum' }] }],
        });
        expect(result.groups!.length).toBe(2);
        const groupA = result.groups!.find(g => g.value === 'A')!;
        expect(groupA.aggregates!['val_sum']).toBe(40);
    });
});

// ─── sync: a partial failure must not redo the operations that succeeded ───

describe('DataSource sync — partial failure', () => {
    function partialTransport() {
        const created: unknown[] = [];
        const state = { failUpdate: true };
        const transport: IDataTransport<Record<string, unknown>> = {
            read: vi.fn(async (): Promise<DataResponse<Record<string, unknown>>> => ({
                data: [{ id: 1, name: 'a' }], total: 1,
            })),
            create: vi.fn(async (item) => { created.push(item); return item; }),
            update: vi.fn(async (item) => {
                if (state.failUpdate) throw new Error('update boom');
                return item;
            }),
            destroy: vi.fn(async () => {}),
        };
        return { transport, created, state };
    }

    it('does not duplicate the creates on a retry after a failed update', async () => {
        const { transport, created, state } = partialTransport();
        const ds = createDataSource({ transport, autoLoad: false });
        await ds.refresh();

        ds.add({ id: 2, name: 'nuovo' });
        ds.update({ id: 1, name: 'b' });

        await ds.sync(); // the create is fine, the update fails
        expect(created.length).toBe(1);
        expect(ds.error()).toBeTruthy();
        // the create that succeeded must NOT still be among the pending changes
        expect(ds.changes().added.length).toBe(0);
        expect(ds.changes().updated.length).toBe(1);

        state.failUpdate = false;
        await ds.sync(); // retry: the update alone
        expect(created.length).toBe(1); // no duplicate
        expect(ds.hasChanges()).toBe(false);
    });

    it('optimistic: on retry it does not redo the creates that succeeded, and it uses the PATCH diff', async () => {
        const { transport, created, state } = partialTransport();
        const patched: unknown[] = [];
        transport.patch = vi.fn(async (id, diff) => { patched.push({ id, diff }); return diff as Record<string, unknown>; });
        state.failUpdate = false;
        const ds = createDataSource({ transport, autoLoad: false, optimistic: true });
        await ds.refresh();

        ds.add({ id: 2, name: 'nuovo' });
        ds.update({ id: 1, name: 'b' }); // the original is there → PATCH with the name field alone
        await ds.sync();
        expect(created.length).toBe(1);
        expect(patched.length).toBe(1); // the PATCH-diff path has to work under optimistic too
    });
});

// The loadMore race, add with no id, the distinctValues cache

describe('DataSource — loadMore/add/distinct', () => {
    it('loadMore during a load in flight does not skip pages', async () => {
        const resolvers: Array<() => void> = [];
        const pages: number[] = [];
        const transport: IDataTransport<Record<string, unknown>> = {
            read: (req: DataRequest) => new Promise<DataResponse<Record<string, unknown>>>((res) => {
                pages.push(req.page);
                resolvers.push(() => res({ data: [{ id: req.page }], total: 10 }));
            }),
        };
        const ds = createDataSource({ transport, pageSize: 1, autoLoad: false });
        const p0 = ds.refresh(); resolvers.shift()!(); await p0;

        const p1 = ds.loadMore();
        const p2 = ds.loadMore(); // concurrent: it must be ignored, not jump to page 3
        while (resolvers.length) resolvers.shift()!();
        await Promise.all([p1, p2]);

        expect(ds.data().map(r => r.id)).toEqual([1, 2]); // without the fix: [1, 3]
    });

    it('add() with no id assigns a consistent temporary id', () => {
        const ds = createDataSource<Record<string, unknown>>({ data: [] });
        ds.add({ name: 'x' });
        const added = ds.changes().added[0];
        expect(added.id).toBeDefined();

        ds.update({ ...added, name: 'y' });
        expect(ds.changes().added.length).toBe(1);   // a single 'added' entry remains
        expect(ds.changes().updated.length).toBe(0); // no duplicate 'updated'
        expect(ds.changes().added[0].name).toBe('y');
    });

    it('distinctValues is cached, and the refresh invalidates it', async () => {
        const transport = mockTransport(users);
        const ds = createDataSource({ transport, pageSize: 10 });
        await new Promise(r => setTimeout(r, 0));
        const callsAfterLoad = (transport.read as ReturnType<typeof vi.fn>).mock.calls.length;

        await ds.distinctValues('name');
        await ds.distinctValues('name'); // the second call: cached, no new read
        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterLoad + 1);

        await ds.refresh(); // invalida
        await ds.distinctValues('name');
        expect((transport.read as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterLoad + 3);
    });
});
