// The assets as the server starts with them.
//
// In its own module, with no imports, for the reason `seed.ts` gives for the tickets: the ticket seed
// names an asset, and reading one from here costs the tickets nothing else — not the asset store,
// not the customers, not the sites.
//
// Arithmetic, so a spec derives every number from these lines:
// - 40 assets. The first 25 are each KIND for the customers 1…5 — the five the tickets name — so
//   `assetIdFor(customer, kind)` is (customer − 1) × 5 + kind + 1; the other 15 belong to 6…12;
// - the site cycles through the 14 of `sites.ts`; installed 2021…2024, a three-year warranty, so
//   some have ended and some have not;
// - every ninth is in repair, every thirteenth retired.

export type AssetKind = 'printer' | 'scanner' | 'laptop' | 'network' | 'phone';
export const ASSET_KINDS: AssetKind[] = ['printer', 'scanner', 'laptop', 'network', 'phone'];

export type AssetStatus = 'inService' | 'inRepair' | 'retired';
export const ASSET_STATUSES: AssetStatus[] = ['inService', 'inRepair', 'retired'];

export interface AssetRecord extends Record<string, unknown> {
    id: number;
    serial: string;
    name: string;
    kind: AssetKind;
    customerId: number;
    siteId: number;
    installed: string;
    warrantyEnds: string;
    status: AssetStatus;
    /** Category codes: hardware or network by kind, and peripherals for the printer and the scanner. */
    categories: string[];
}

const KIND_CATEGORIES: Record<AssetKind, string[]> = {
    printer: ['hardware', 'peripherals'], scanner: ['hardware', 'peripherals'],
    laptop: ['hardware'], network: ['network'], phone: ['hardware'],
};

const MODEL: Record<AssetKind, [string, string]> = {
    printer: ['PRN', 'HP LaserJet M404'],
    scanner: ['SCN', 'Zebra DS2208'],
    laptop: ['LPT', 'Lenovo ThinkPad T14'],
    network: ['NET', 'Cisco Meraki MR36'],
    phone: ['PHN', 'Yealink T54W'],
};

/** How many customers own a whole set, and how many sites the assets cycle through. */
const FULL_SETS = 5;
const SITE_COUNT = 14;

/** The asset of this kind that this customer owns in the seed, or 0 outside the first five. */
export function assetIdFor(customerId: number, kind: AssetKind): number {
    if (customerId < 1 || customerId > FULL_SETS) return 0;
    return (customerId - 1) * ASSET_KINDS.length + ASSET_KINDS.indexOf(kind) + 1;
}

function asset(id: number, customerId: number, kind: AssetKind): AssetRecord {
    const [prefix, name] = MODEL[kind];
    const year = 2021 + (id % 4);
    const monthDay = `${String(1 + (id % 12)).padStart(2, '0')}-15`;
    return {
        id, kind, customerId, name,
        serial: `${prefix}-${4000 + id}`,
        siteId: ((id - 1) % SITE_COUNT) + 1,
        installed: `${year}-${monthDay}`,
        warrantyEnds: `${year + 3}-${monthDay}`,
        status: id % 13 === 0 ? 'retired' : id % 9 === 0 ? 'inRepair' : 'inService',
        categories: [...KIND_CATEGORIES[kind]],
    };
}

/** A fresh copy every call: the store owns and mutates its own. */
export function assetSeed(): AssetRecord[] {
    const out: AssetRecord[] = [];
    for (let c = 1; c <= FULL_SETS; c++) {
        for (const kind of ASSET_KINDS) out.push(asset(assetIdFor(c, kind), c, kind));
    }
    for (let id = out.length + 1; id <= 40; id++) {
        out.push(asset(id, 6 + ((id - 26) % 7), ASSET_KINDS[id % ASSET_KINDS.length]));
    }
    return out;
}
