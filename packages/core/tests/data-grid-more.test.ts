// useDataGrid — the column-resolution rules, the persisted state, and the edges of sort/reorder.
// data-grid.test.ts walks the happy path of each action.
//
// Most of what this file measures is sizing: a grid whose columns are all "150px, flex 1" is a
// grid nobody ships, so the type inference and the width defaults ARE the feature.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDataGrid } from '../src/data/data-grid';
import { createDataSource } from '../src/data/data-source';

interface Row extends Record<string, unknown> { name: string; price: number; qty: number }

const data: Row[] = [
    { name: 'A', price: 10, qty: 1 },
    { name: 'B', price: 20, qty: 2 },
];

const byField = (g: ReturnType<typeof useDataGrid<Row>>) =>
    Object.fromEntries(g.columns().map((c) => [c.field, c]));

beforeEach(() => localStorage.clear());

describe('the source it is given', () => {
    it('wraps a plain array', async () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }] });
        await new Promise((r) => setTimeout(r, 0));   // the wrapped source loads asynchronously
        expect(g.rows()).toHaveLength(2);
    });

    it('uses an existing DataSource as it is, rather than copying the rows out of it', async () => {
        const ds = createDataSource<Row>({ data, pageSize: 1 });
        await new Promise((r) => setTimeout(r, 0));
        const g = useDataGrid<Row>({ source: ds, columns: [{ field: 'name' }] });

        expect(g.source, 'the grid built a second source and the two would drift').toBe(ds);
        expect(g.rows()).toHaveLength(1);
        expect(g.totalPages()).toBe(2);

        ds.setPage(2);
        await new Promise((r) => setTimeout(r, 0));
        expect(g.rows()[0].name, 'the grid did not follow its own source').toBe('B');
    });
});

describe('type inference decides the width', () => {
    const grid = (columns: Parameters<typeof useDataGrid<Record<string, unknown>>>[0]['columns']) =>
        useDataGrid<Record<string, unknown>>({ source: [], columns });

    it('reads the type out of the field name', () => {
        const c = byField(grid([
            { field: 'createdAt' }, { field: 'updated_at' }, { field: 'birthDate' },
            { field: 'email' }, { field: 'totalAmount' }, { field: 'unitPrice' },
            { field: 'isActive' }, { field: 'hasAccess' }, { field: 'enabled' },
            { field: 'name' },
        ]) as never);

        expect(c.createdAt.type).toBe('date');
        expect(c.updated_at.type).toBe('date');
        expect(c.birthDate.type).toBe('date');
        expect(c.email.type).toBe('email');
        expect(c.totalAmount.type).toBe('currency');
        expect(c.unitPrice.type).toBe('currency');
        expect(c.isActive.type).toBe('boolean');
        expect(c.hasAccess.type).toBe('boolean');
        expect(c.enabled.type).toBe('boolean');
        expect(c.name.type).toBe('text');
    });

    it('a computed column is text — its name says nothing about its value', () => {
        const c = byField(grid([{ field: 'totalPrice', compute: () => 1 }]) as never);
        expect(c.totalPrice.type).toBe('text');
    });

    it('a declared type wins over the guess', () => {
        const c = byField(grid([{ field: 'isActive', type: 'enum' }]) as never);
        expect(c.isActive.type).toBe('enum');
        expect(c.isActive.width, 'the width followed the guessed type, not the declared one').toBe(120);
    });

    it('a typed column is fixed, a text column stretches', () => {
        const c = byField(grid([
            { field: 'name' }, { field: 'isActive' }, { field: 'qty', type: 'number' },
            { field: 'price' }, { field: 'createdAt' }, { field: 'email' },
        ]) as never);

        expect([c.name.width, c.name.flex]).toEqual([150, 1]);
        expect([c.isActive.width, c.isActive.flex]).toEqual([100, 0]);
        expect([c.qty.width, c.qty.flex]).toEqual([110, 0]);
        expect([c.price.width, c.price.flex]).toEqual([130, 0]);
        expect([c.createdAt.width, c.createdAt.flex]).toEqual([130, 0]);
        expect([c.email.width, c.email.flex]).toEqual([200, 1]);
    });

    it('an explicit width turns the stretch off', () => {
        // Beside a second text column, so the all-fixed fill pass below does not re-flex it.
        const c = byField(grid([{ field: 'name', width: 300 }, { field: 'label' }]) as never);
        expect(c.name.width).toBe(300);
        expect(c.name.flex, 'a column given a width still fought the layout for space').toBe(0);
        expect(c.label.flex).toBe(1);
    });

    it('a declared flex beats both', () => {
        const c = byField(grid([{ field: 'isActive', flex: 2 }]) as never);
        expect(c.isActive.flex).toBe(2);
    });

    it('all-fixed columns share the leftover space in proportion to their widths', () => {
        // Otherwise a grid of numbers and dates leaves a dead strip on the right.
        const c = byField(grid([{ field: 'isActive' }, { field: 'price' }]) as never);
        expect(c.isActive.flex).toBe(100);
        expect(c.price.flex).toBe(130);
    });

    it('one stretching column is enough to stop that', () => {
        const c = byField(grid([{ field: 'isActive' }, { field: 'name' }]) as never);
        expect(c.isActive.flex).toBe(0);
        expect(c.name.flex).toBe(1);
    });

    it('a hidden column does not take part in the fill', () => {
        const g = grid([{ field: 'isActive' }, { field: 'name', hidden: true }]) as never as ReturnType<typeof useDataGrid<Row>>;
        expect(byField(g).isActive.flex, 'an invisible text column kept the visible ones from filling')
            .toBe(100);
    });
});

describe('header, alignment and minWidth', () => {
    it('humanises the field name when no header is given', () => {
        const g = useDataGrid<Row>({ source: [], columns: [{ field: 'unitPrice' }, { field: 'name', header: 'Nome' }] });
        const c = byField(g);
        expect(c.unitPrice.header).toBe('Unit Price');
        expect(c.name.header).toBe('Nome');
    });

    it('numbers align right, text left, booleans centre', () => {
        const g = useDataGrid<Record<string, unknown>>({
            source: [], columns: [{ field: 'price' }, { field: 'name' }, { field: 'isActive' }],
        });
        const c = byField(g as never);
        expect(c.price.align).toBe('right');
        expect(c.name.align).toBe('left');
        expect(c.isActive.align).toBe('center');
    });

    it('a sortable column reserves room for its caret; a non-sortable one does not', () => {
        const g = useDataGrid<Record<string, unknown>>({
            source: [], columns: [{ field: 'ok' }, { field: 'ko', sortable: false }],
        });
        const c = byField(g as never);
        expect(c.ok.minWidth).toBe(70);
        expect(c.ko.minWidth).toBe(60);
    });

    it('a declared minWidth wins', () => {
        const g = useDataGrid<Record<string, unknown>>({ source: [], columns: [{ field: 'a', minWidth: 220 }] });
        expect(byField(g as never).a.minWidth).toBe(220);
    });

    it('a command column is never sortable, whatever it declares', () => {
        const g = useDataGrid<Record<string, unknown>>({
            source: [], columns: [{ field: 'actions', command: [{ name: 'edit' }], sortable: true }],
        } as never);
        expect(byField(g as never).actions.sortable,
            'a button column offered to sort the rows by its buttons').toBe(false);
    });
});

describe('sort', () => {
    it('an explicit direction skips the toggle cycle', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }] });
        g.sort('name', 'desc');
        expect(g.sortState()).toEqual([{ field: 'name', dir: 'desc' }]);
        g.sort('name', 'desc');
        expect(g.sortState(), 'an explicit direction toggled anyway').toEqual([{ field: 'name', dir: 'desc' }]);
    });

    it('sorting a field nobody declared does nothing', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }] });
        g.sort('ghost');
        expect(g.sortState()).toEqual([]);
    });

    it('append replaces that field rather than sorting by it twice', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }, { field: 'price' }] });
        g.sort('name');
        g.sort('price', 'asc', true);
        g.sort('price', 'desc', true);

        expect(g.sortState()).toEqual([
            { field: 'name', dir: 'asc' },
            { field: 'price', dir: 'desc' },
        ]);
    });

    it('the columns carry the sort position, so the header can number them', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }, { field: 'price' }] });
        g.sort('price');
        g.sort('name', 'asc', true);

        const c = byField(g);
        expect([c.price.sortIndex, c.price.sortDir]).toEqual([0, 'asc']);
        expect([c.name.sortIndex, c.name.sortDir]).toEqual([1, 'asc']);
    });

    it('an unsorted column says so, rather than pretending to be first', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }] });
        expect(byField(g).name.sortIndex).toBe(-1);
        expect(byField(g).name.sortDir).toBeNull();
    });

    it('clearSort empties it', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }] });
        g.sort('name');
        g.clearSort();
        expect(g.sortState()).toEqual([]);
    });
});

describe('reorder and resize edges', () => {
    it('moving a column onto itself is not a move', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }, { field: 'price' }] });
        g.reorder('name', 'name');
        expect(g.columns().map((c) => c.field)).toEqual(['name', 'price']);
    });

    it('a field that is not in the grid leaves the order alone', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }, { field: 'price' }] });
        g.reorder('ghost', 'name');
        g.reorder('name', 'ghost');
        expect(g.columns().map((c) => c.field)).toEqual(['name', 'price']);
    });

    it('resizing a field that is not in the grid does nothing', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }] });
        g.resize('ghost', 500);
        expect(byField(g).name.width).toBe(150);
    });

    it('a resize below the declared minimum stops at the minimum', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name', minWidth: 120, maxWidth: 400 }] });
        g.resize('name', 10);
        expect(byField(g).name.width).toBe(120);
        g.resize('name', 9000);
        expect(byField(g).name.width).toBe(400);
    });
});

describe('columns with no field', () => {
    it('gets a synthetic key, so a checkbox column still resolves', () => {
        const g = useDataGrid<Row>({
            source: data,
            columns: [{ header: '' } as never, { field: 'name' }],
        });
        const fields = g.columns().map((c) => c.field);
        expect(fields[0]).toMatch(/^__col\d+$/);
        expect(fields[1]).toBe('name');
    });
});

describe('column groups, two levels deep', () => {
    it('a group under a group is flattened into the nearest declared group', () => {
        const g = useDataGrid<Record<string, unknown>>({
            source: [],
            columns: [
                { header: 'Contact', children: [
                    { header: 'Home', children: [{ field: 'street' }, { field: 'city' }] },
                    { field: 'phone' },
                ] },
            ],
        });

        const c = byField(g as never);
        expect(Object.keys(c)).toEqual(['street', 'city', 'phone']);
        for (const f of ['street', 'city', 'phone']) {
            expect(c[f].group, `${f} lost its group header`).toBe('Contact');
        }
        expect(new Set(Object.values(c).map((x) => x.groupId)).size,
            'the grandchildren ended up in a group of their own').toBe(1);
    });

    it('an empty children array is a plain column, not a group', () => {
        const g = useDataGrid<Record<string, unknown>>({
            source: [], columns: [{ field: 'a', children: [] }],
        });
        expect(byField(g as never).a.group).toBeNull();
    });

    it('a group with no header of its own is named after its field', () => {
        const g = useDataGrid<Record<string, unknown>>({
            source: [], columns: [{ field: 'homeAddress', children: [{ field: 'city' }] }],
        });
        expect(byField(g as never).city.group).toBe('Home Address');
    });

    it('and is left unnamed when it has neither', () => {
        const g = useDataGrid<Record<string, unknown>>({
            source: [], columns: [{ children: [{ field: 'city' }] } as never],
        });
        expect(byField(g as never).city.group).toBe('');
    });
});

describe('persisted grid state', () => {
    const key = 'orders';

    it('restores order, widths, visibility and sort from localStorage', () => {
        localStorage.setItem(`pdx-grid-${key}`, JSON.stringify({
            columnOrder: ['price', 'name'],
            columnWidths: { name: 321 },
            columnVisibility: { price: false },
            sort: [{ field: 'price', dir: 'desc' }],
        }));

        const g = useDataGrid<Row>({
            source: data, stateKey: key,
            columns: [{ field: 'name' }, { field: 'price' }],
        });

        expect(g.columns().map((c) => c.field)).toEqual(['price', 'name']);
        expect(byField(g).name.width).toBe(321);
        expect(byField(g).price.visible).toBe(false);
        expect(g.sortState()).toEqual([{ field: 'price', dir: 'desc' }]);
    });

    it('writes it back on dispose', () => {
        const g = useDataGrid<Row>({
            source: data, stateKey: key,
            columns: [{ field: 'name' }, { field: 'price' }],
        });
        g.resize('name', 200);
        g.toggleColumn('price');
        g.dispose();

        const saved = JSON.parse(localStorage.getItem(`pdx-grid-${key}`)!);
        expect(saved.columnWidths.name).toBe(200);
        expect(saved.columnVisibility.price).toBe(false);
    });

    it('ignores a corrupt entry instead of refusing to build the grid', () => {
        localStorage.setItem(`pdx-grid-${key}`, 'not json at all');
        expect(() => useDataGrid<Row>({ source: data, stateKey: key, columns: [{ field: 'name' }] }))
            .not.toThrow();
    });

    it('survives a storage that refuses to write', () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => { throw new Error('QuotaExceededError'); });
        const g = useDataGrid<Row>({ source: data, stateKey: key, columns: [{ field: 'name' }] });

        expect(() => g.dispose(), 'a full localStorage took the grid down with it').not.toThrow();
        setItem.mockRestore();
    });

    it('a grid with no stateKey neither reads nor writes', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }] });
        g.resize('name', 200);
        g.dispose();
        expect(localStorage.length).toBe(0);
    });

    it('loadState applies only the keys the state carries', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }, { field: 'price' }] });
        g.resize('name', 200);

        g.loadState({ sort: [{ field: 'name', dir: 'asc' }] });

        expect(g.sortState()).toEqual([{ field: 'name', dir: 'asc' }]);
        expect(byField(g).name.width, 'a partial state wiped the widths').toBe(200);
    });

    it('saveState hands back a copy, not the live state', () => {
        const g = useDataGrid<Row>({ source: data, columns: [{ field: 'name' }] });
        const state = g.saveState();
        state.columnWidths!.name = 999;
        state.sort!.push({ field: 'name', dir: 'desc' });

        expect(byField(g).name.width).not.toBe(999);
        expect(g.sortState(), 'the saved state was a live handle into the grid').toEqual([]);
    });
});
