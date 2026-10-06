// The asset store: what a ticket is opened on.
//
// A printer, a scanner, a laptop — owned by a customer, installed at a site. Retired, never deleted.
// This module knows the asset and nothing else: the ticket detail reads an asset through it, and a
// customer's or a site's NAME is the list's to add (`asset-rows.ts`), not a cost every reader pays.
import { signal } from '@pdxui/core';
import { createMemoryStore, type StoredRow } from './memory-store';
import { assetSeed, type AssetRecord } from './asset-seed';

export { ASSET_KINDS, ASSET_STATUSES, type AssetKind, type AssetStatus } from './asset-seed';

export interface Asset extends StoredRow, AssetRecord {
    id: number;
}

const store = createMemoryStore<Asset>({
    seed: assetSeed,
    create: (values, id) => ({
        id,
        serial: String(values.serial ?? ''),
        name: String(values.name ?? ''),
        kind: values.kind ?? 'printer',
        customerId: Number(values.customerId ?? 0),
        siteId: Number(values.siteId ?? 0),
        installed: String(values.installed ?? new Date().toISOString().slice(0, 10)),
        warrantyEnds: String(values.warrantyEnds ?? ''),
        status: values.status ?? 'inService',
        categories: Array.isArray(values.categories) ? values.categories.map(String) : [],
    }),
    refusal: 'The server refused: an asset is retired, not deleted.',
    bulkRefusal: 'The server refused this one: the asset has an open ticket.',
});

/** Bumped on every write, so a screen reading an asset through `assetById` reads it again. */
const version = signal(0);

export const assetTransport = {
    ...store.transport,
    async update(row: Asset): Promise<Asset> {
        const saved = await store.transport.update(row);
        version.set((v) => v + 1);
        return saved;
    },
};

/** One asset, reactively: a saved edit reaches every screen that shows it. */
export function assetById(id: number): Asset | undefined {
    version();
    return store.byId(id);
}
