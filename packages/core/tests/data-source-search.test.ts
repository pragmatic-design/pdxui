// A quick search over some fields, beside the filters and not among them.
//
// The reference's lists have a search box: one term, looked for in the columns that make sense to
// search. It is not a filter a reader built — it has no chip, and a saved view does not keep it —
// so it lives in its own signal. What the TRANSPORT receives is the one shape every adapter already
// sends: an OR of `contains` over those fields, appended to the filter. A new request field would
// be one each adapter has to learn, and an adapter that did not would simply not search.
import { describe, it, expect } from 'vitest';
import { createDataSource } from '../src/data/data-source';
import type { DataRequest } from '../src/data/transport';

const ROWS = [
    { id: 1, subject: 'VPN drops', customer: 'Northwind', status: 'open' },
    { id: 2, subject: 'Printer jam', customer: 'Contoso', status: 'open' },
    { id: 3, subject: 'Laptop fan', customer: 'VPNet Inc', status: 'closed' },
    { id: 4, subject: 'Mail delay', customer: 'Fabrikam', status: 'open' },
];

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('DataSource search', () => {
    it('keeps the rows where any searched field contains the term, case-insensitively', async () => {
        const ds = createDataSource({ data: ROWS, pageSize: 0 });
        await settle();
        ds.setSearch('vpn', ['subject', 'customer']);
        await settle();
        expect(ds.data().map((r) => r.id)).toEqual([1, 3]);
        expect(ds.search()).toBe('vpn');
    });

    it('is not a filter: source.filter() stays what the reader built', async () => {
        const ds = createDataSource({ data: ROWS, pageSize: 0 });
        ds.setFilter([{ field: 'status', operator: 'eq', value: 'open' }]);
        ds.setSearch('vpn', ['subject', 'customer']);
        await settle();
        expect(ds.filter()).toEqual([{ field: 'status', operator: 'eq', value: 'open' }]);
        // Both apply: open AND (subject or customer has vpn).
        expect(ds.data().map((r) => r.id)).toEqual([1]);
    });

    it('reaches the transport as an OR of contains, appended to the filter', async () => {
        const seen: DataRequest[] = [];
        const ds = createDataSource({
            transport: { read: async (req: DataRequest) => { seen.push(req); return { data: [], total: 0 }; } },
            pageSize: 10,
        });
        await settle();
        ds.setSearch('jam', ['subject', 'customer']);
        await settle();
        expect(seen.at(-1)!.filter).toEqual([{ logic: 'or', filters: [
            { field: 'subject', operator: 'contains', value: 'jam' },
            { field: 'customer', operator: 'contains', value: 'jam' },
        ] }]);
        expect(seen.at(-1)!.page, 'a new search starts on page 1').toBe(1);
    });

    it('the export and select-all see it too', async () => {
        const ds = createDataSource({ data: ROWS, pageSize: 2 });
        ds.setSearch('vpn', ['subject', 'customer']);
        await settle();
        expect((await ds.getAllRows()).map((r) => r.id)).toEqual([1, 3]);
        expect(await ds.getAllIds()).toEqual([1, 3]);
    });

    it('an empty or blank term clears it', async () => {
        const ds = createDataSource({ data: ROWS, pageSize: 0 });
        ds.setSearch('vpn', ['subject']);
        await settle();
        ds.setSearch('  ', ['subject']);
        await settle();
        expect(ds.data()).toHaveLength(4);
        expect(ds.search()).toBe('');
    });

    it('control — with no search the request carries only the filter', async () => {
        const seen: DataRequest[] = [];
        const ds = createDataSource({
            transport: { read: async (req: DataRequest) => { seen.push(req); return { data: [], total: 0 }; } },
            filter: [{ field: 'status', operator: 'eq', value: 'open' }],
        });
        await settle();
        expect(ds.search()).toBe('');
        expect(seen.at(-1)!.filter).toEqual([{ field: 'status', operator: 'eq', value: 'open' }]);
    });
});
