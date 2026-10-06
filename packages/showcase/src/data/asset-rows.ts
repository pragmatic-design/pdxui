// The assets as a list reads them: with the customer's and the site's NAMES.
//
// A server joins these; the store holds the ids. So a filter on `customer` is answered the way a
// join would answer it — the customers whose name matches, then the assets they own — and each row
// of the page comes back named. Separate from `assets.ts` so the ticket detail, which reads one
// asset, does not carry the customers and the sites with it.
import { clientGroup, type CompositeFilter, type DataRequest, type DataResponse, type FilterDescriptor } from '@pdxui/core';
import { assetTransport, type Asset } from './assets';
import { customerTransport } from './customers';
import { siteById } from './sites';

export type AssetRow = Asset & { customer: string; site: string };

/** Every customer, id → name: a join's other side. */
async function customerNames(): Promise<Map<number, string>> {
    const all = await customerTransport.read({ page: 1, pageSize: 0, sort: [], filter: [] });
    return new Map(all.data.map((c) => [c.id, c.name]));
}

/** A filter on the customer's NAME, rewritten to the ids that have it. The rest passes through. */
function joinCustomer(f: FilterDescriptor | CompositeFilter, names: Map<number, string>): FilterDescriptor | CompositeFilter {
    if (!('field' in f)) return { ...f, filters: f.filters.map((sub) => joinCustomer(sub, names)) };
    if (f.field !== 'customer') return f;
    const needle = String(f.value ?? '').toLowerCase();
    const ids = [...names].filter(([, name]) => f.operator === 'eq'
        ? name.toLowerCase() === needle
        : name.toLowerCase().includes(needle)).map(([id]) => id);
    return { field: 'customerId', operator: 'in', value: ids };
}

/** An asset with its customer's and its site's names. */
const named = (a: Asset, names: Map<number, string>): AssetRow => ({
    ...a,
    customer: names.get(a.customerId) ?? '',
    site: siteById(a.siteId)?.name ?? '',
});

export const assetRowTransport = {
    async read(request: DataRequest): Promise<DataResponse<AssetRow>> {
        const names = await customerNames();
        const filter = (request.filter ?? []).map((f) => joinCustomer(f, names));
        // Grouped, the groups are the JOINED rows' — «customer» is a name only here — over every row
        // the filter kept, as the store groups. So the whole set is read, named, grouped,
        // and the page is cut from it.
        if (request.group && request.group.length > 0) {
            const all = await assetTransport.read({ ...request, filter, group: undefined, page: 1, pageSize: 0 });
            const rows = all.data.map((a) => named(a, names));
            const size = request.pageSize > 0 ? request.pageSize : rows.length;
            const start = (Math.max(1, request.page) - 1) * size;
            return { total: all.total, data: rows.slice(start, start + size), groups: clientGroup(rows, request.group) };
        }
        const answer = await assetTransport.read({ ...request, filter });
        window.__pdxLastAssetRequest = {
            filter: (request.filter ?? [])
                .filter((f): f is FilterDescriptor => 'field' in f)
                .map((f) => ({ field: String(f.field), value: String(f.value ?? '') })),
            total: answer.total,
        };
        return { total: answer.total, data: answer.data.map((a) => named(a, names)) };
    },
};
