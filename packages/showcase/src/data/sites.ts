// The sites an employee can be assigned to.
//
// A SOURCE, not an array: the assignment picks its site through `<pdx-relation-picker>`, and a
// picker over a list short enough to hand out whole proves nothing a `<select>` would not. Fourteen
// sites, paged and searched by the store the way a server would, as intake's customers are.
//
// A kind of record of its own: a list, a detail, an address. Closed, never deleted.
import { signal } from '@pdxui/core';
import type { DataRequest, DataResponse, FilterDescriptor } from '@pdxui/core';
import { createMemoryStore, type StoredRow } from './memory-store';
import { peopleAtSite } from './employees';

export type SiteStatus = 'active' | 'closed';
export const SITE_STATUSES: SiteStatus[] = ['active', 'closed'];

export interface Site extends StoredRow {
    id: number;
    name: string;
    city: string;
    address: string;
    postcode: string;
    province: string;
    phone: string;
    status: SiteStatus;
}

const SITES: [string, string][] = [
    ['Verona Nord', 'Verona'], ['Verona Sud', 'Verona'], ['Milano Centrale', 'Milano'],
    ['Milano Bovisa', 'Milano'], ['Torino Lingotto', 'Torino'], ['Bologna Fiera', 'Bologna'],
    ['Padova Est', 'Padova'], ['Trento Sud', 'Trento'], ['Brescia Ovest', 'Brescia'],
    ['Vicenza Nord', 'Vicenza'], ['Bergamo Porta Nuova', 'Bergamo'], ['Modena Ovest', 'Modena'],
    ['Parma Centro', 'Parma'], ['Genova Porto', 'Genova'],
];

/** Each city's province, postcode and dialling prefix: what the seed fills an address from. */
const CITIES: Record<string, [string, string, string]> = {
    Verona: ['VR', '37121', '045'], Milano: ['MI', '20121', '02'], Torino: ['TO', '10121', '011'],
    Bologna: ['BO', '40121', '051'], Padova: ['PD', '35121', '049'], Trento: ['TN', '38121', '0461'],
    Brescia: ['BS', '25121', '030'], Vicenza: ['VI', '36100', '0444'], Bergamo: ['BG', '24121', '035'],
    Modena: ['MO', '41121', '059'], Parma: ['PR', '43121', '0521'], Genova: ['GE', '16121', '010'],
};

function seedSite([name, city]: [string, string], i: number): Site {
    const [province, postcode, prefix] = CITIES[city];
    return {
        id: i + 1, name, city, province, postcode,
        address: `Via dell'Industria ${10 + i * 3}`,
        phone: `${prefix} ${String(5550100 + i * 17).slice(0, 7)}`,
        // One closed, so the list shows both states.
        status: name === 'Trento Sud' ? 'closed' : 'active',
    };
}

const store = createMemoryStore<Site>({
    seed: () => SITES.map(seedSite),
    create: (values, id) => ({
        id, name: String(values.name ?? ''), city: String(values.city ?? ''),
        address: '', postcode: '', province: '', phone: '', status: 'active',
    }),
    refusal: 'The server refused: a site is closed, not deleted.',
    bulkRefusal: 'The server refused this one: the site has people assigned.',
});

/** Bumped on every write, so a screen reading a site through `siteById` reads it again. */
const version = signal(0);

/** A site as the list reads it: with the number of people assigned there now, as a server would count it. */
export type SiteRow = Site & { people: number };

/**
 * The store's transport, and what it was last ASKED for: a filtered request and a client-side slice
 * of a page already downloaded look the same on screen, and a test has to tell them apart.
 */
export const siteTransport = {
    ...store.transport,
    async read(request: DataRequest): Promise<DataResponse<SiteRow>> {
        const answer = await store.transport.read(request);
        window.__pdxLastSiteRequest = {
            filter: (request.filter ?? [])
                .filter((f): f is FilterDescriptor => 'field' in f)
                .map(f => ({ field: String(f.field), value: String(f.value ?? '') })),
            page: request.page,
            total: answer.total,
        };
        // The store groups nothing, so the answer is its rows and its total.
        return { total: answer.total, data: answer.data.map((s) => ({ ...s, people: peopleAtSite(s.id).length })) };
    },
    async create(values: Partial<Site>): Promise<Site> {
        const row = await store.transport.create(values);
        version.set((v) => v + 1);
        return row;
    },
    async update(row: Site): Promise<Site> {
        const saved = await store.transport.update(row);
        version.set((v) => v + 1);
        return saved;
    },
};

/** One site, reactively: a saved edit reaches every screen that shows it. */
export function siteById(id: number): Site | undefined {
    version();
    return store.byId(id);
}
