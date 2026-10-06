// Coverage (5): useDataGrid — headless data grid composable (covers data-grid + data-grid-types).

import { describe, it, expect } from 'vitest';
import { useDataGrid } from '../src/data/data-grid';

type Row = { name: string; price: number; isActive: boolean; email: string; createdAt: string };

function makeGrid() {
    return useDataGrid<Row>({
        source: [
            { name: 'A', price: 10, isActive: true, email: 'a@x.io', createdAt: '2024-01-01' },
            { name: 'B', price: 20, isActive: false, email: 'b@x.io', createdAt: '2024-02-01' },
        ],
        columns: [
            { field: 'name' }, { field: 'price' }, { field: 'isActive' },
            { field: 'email' }, { field: 'createdAt' },
        ],
    });
}

describe('useDataGrid', () => {
    it('resolves columns with headers and inferred types', () => {
        const g = makeGrid();
        const byField = Object.fromEntries(g.columns().map(c => [c.field, c]));
        expect(byField.price.type).toBe('currency');
        expect(byField.isActive.type).toBe('boolean');
        expect(byField.email.type).toBe('email');
        expect(byField.createdAt.type).toBe('date');
        expect(byField.name.type).toBe('text');
        expect(byField.name.header).toBeTruthy();
        expect(byField.name.width).toBeGreaterThan(0);
    });

    it('sort toggles asc → desc → removed', () => {
        const g = makeGrid();
        g.sort('name');
        expect(g.sortState()).toEqual([{ field: 'name', dir: 'asc' }]);
        g.sort('name');
        expect(g.sortState()).toEqual([{ field: 'name', dir: 'desc' }]);
        g.sort('name');
        expect(g.sortState()).toEqual([]);
    });

    it('multi-sort with append', () => {
        const g = makeGrid();
        g.sort('name', 'asc');
        g.sort('price', 'desc', true);
        expect(g.sortState()).toEqual([
            { field: 'name', dir: 'asc' },
            { field: 'price', dir: 'desc' },
        ]);
        g.clearSort();
        expect(g.sortState()).toEqual([]);
    });

    it('resize clamps to min/max width', () => {
        const g = makeGrid();
        g.resize('name', 5);          // below min
        expect(g.columns().find(c => c.field === 'name')!.width).toBeGreaterThanOrEqual(60);
    });

    it('reorder moves a column before another', () => {
        const g = makeGrid();
        g.reorder('email', 'name'); // move email before name
        expect(g.columns()[0].field).toBe('email');
    });

    it('toggleColumn flips visibility', () => {
        const g = makeGrid();
        g.toggleColumn('name');
        expect(g.columns().find(c => c.field === 'name')!.visible).toBe(false);
        g.toggleColumn('name');
        expect(g.columns().find(c => c.field === 'name')!.visible).toBe(true);
    });

    it('saveState / loadState round-trips column order + sort', () => {
        const g = makeGrid();
        g.sort('price', 'desc');
        g.reorder('email', 'name');
        const state = g.saveState();
        expect(state.columnOrder[0]).toBe('email');
        expect(state.sort).toEqual([{ field: 'price', dir: 'desc' }]);

        const g2 = makeGrid();
        g2.loadState(state);
        expect(g2.columns()[0].field).toBe('email');
        expect(g2.sortState()).toEqual([{ field: 'price', dir: 'desc' }]);
    });

    it('ignores sort on a non-sortable column', () => {
        const g = useDataGrid<Row>({
            source: [],
            columns: [{ field: 'name', sortable: false }, { field: 'price' }],
        });
        g.sort('name');
        expect(g.sortState()).toEqual([]);
    });
});

// BUG 7 — column groups (`children`) flatten into leaf columns tagged with their parent group.
describe('useDataGrid — column groups (children)', () => {
    function makeGrouped() {
        return useDataGrid<Record<string, unknown>>({
            source: [{ name: 'A', city: 'Rome', zip: '00100' }],
            columns: [
                { field: 'name' },
                { field: 'address', header: 'Address', children: [{ field: 'city' }, { field: 'zip' }] },
            ] as never,
        });
    }

    it('flattens children into leaf columns (body operates on leaves)', () => {
        const g = makeGrouped();
        const fields = g.columns().map(c => c.field);
        expect(fields).toEqual(['name', 'city', 'zip']);
    });

    it('tags each leaf with its parent group; top-level columns have no group', () => {
        const g = makeGrouped();
        const by = Object.fromEntries(g.columns().map(c => [c.field, c]));
        expect(by.name.groupId ?? null).toBeNull();
        expect(by.name.group ?? null).toBeNull();
        expect(by.city.group).toBe('Address');
        expect(by.zip.group).toBe('Address');
        expect(by.city.groupId).toBe(by.zip.groupId);
        expect(by.city.groupId).toBeTruthy();
    });

    it('leaves keep sort/resize; reorder is confined to the same group', () => {
        const g = makeGrouped();
        g.sort('city');
        expect(g.sortState()).toEqual([{ field: 'city', dir: 'asc' }]);

        // Cross-group reorder is a no-op (keeps each group's leaves contiguous).
        g.reorder('city', 'name');
        expect(g.columns().map(c => c.field)).toEqual(['name', 'city', 'zip']);

        // Same-group reorder works.
        g.reorder('zip', 'city');
        expect(g.columns().map(c => c.field)).toEqual(['name', 'zip', 'city']);
    });
});
