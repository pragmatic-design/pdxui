// The SECOND entity, and what is left of one once the store is shared.
//
// Every line of it says something about a customer: what one is, what a seed looks like, how a new
// one is named, and what the server says when it will not delete one. Everything else — filtering
// by every operator a filter builder produces, sorting, paging, the latency that makes an
// optimistic screen demonstrable, the refusal that can be armed — is `createMemoryStore`, which the
// ticket store uses too.
//
// That is what "the pattern repeats" means in practice.
import { signal } from '@pdxui/core';
import { createMemoryStore, type StoredRow } from './memory-store';
import type { ImportField } from './csv-import';
import { CUSTOMER_NAMES } from './customer-seed';
import { seedSubscriptions, type Subscription } from './service-seed';

export interface Customer extends StoredRow {
    id: number;
    reference: string;
    name: string;
    sector: string;
    tier: 'standard' | 'business' | 'enterprise';
    status: 'active' | 'onboarding' | 'closed';
    since: string;
    /** Category codes, `categories.ts`'s. */
    categories: string[];
    /** The services it subscribes to, `services.ts`'s ids. Ended, never removed. */
    subscriptions: Subscription[];
}

/** What the seed files a customer under: its tier and sector say so, and every fourth one is billed apart. */
function seedCategories(tier: Customer['tier'], sector: string, i: number): string[] {
    return [
        ...(tier === 'enterprise' ? ['key-account'] : []),
        ...(sector === 'Public sector' ? ['public-sector'] : []),
        ...(i % 4 === 1 ? ['billing'] : []),
    ];
}

const SECTORS = ['Retail', 'Manufacturing', 'Logistics', 'Health', 'Education', 'Public sector'];
const TIERS: Customer['tier'][] = ['standard', 'business', 'enterprise'];
const STATUSES: Customer['status'][] = ['active', 'onboarding', 'closed'];

const store = createMemoryStore<Customer>({
    seed: () => Array.from({ length: 24 }, (_, i) => ({
        id: i + 1,
        reference: `C-${2000 + i}`,
        name: CUSTOMER_NAMES[i],
        sector: SECTORS[i % SECTORS.length],
        tier: TIERS[i % TIERS.length],
        status: STATUSES[i % STATUSES.length],
        since: new Date(Date.UTC(2024, i % 12, 1 + (i % 27))).toISOString().slice(0, 10),
        categories: seedCategories(TIERS[i % TIERS.length], SECTORS[i % SECTORS.length], i),
        subscriptions: seedSubscriptions(i + 1),
    })),

    create: (values, id) => ({
        id,
        reference: `C-${2000 + id}`,
        name: String(values.name ?? ''),
        sector: String(values.sector ?? ''),
        tier: (values.tier as Customer['tier']) ?? 'standard',
        status: (values.status as Customer['status']) ?? 'onboarding',
        since: new Date().toISOString().slice(0, 10),
        categories: Array.isArray(values.categories) ? values.categories.map(String) : [],
        subscriptions: Array.isArray(values.subscriptions) ? values.subscriptions : [],
    }),

    // A domain refusal, like the ticket's: an account with open tickets is not archived, it is
    // handed over. The screen has to survive being told so.
    refusal: 'The server refused: this customer has open tickets.',
    // A bulk write's per-row refusal. This screen raises none today; the store asks for it so the
    // sentence is the ENTITY's, wherever a list grows one.
    bulkRefusal: 'The server refused this one: the account is being audited.',
});

/** Bumped on every write, so a screen reading a customer through `customerById` reads it again. */
const version = signal(0);
const bump = () => version.set((v) => v + 1);

export const customerTransport: typeof store.transport = {
    ...store.transport,
    async create(values) { const created = await store.transport.create(values); bump(); return created; },
    async update(row) { const saved = await store.transport.update(row); bump(); return saved; },
    async destroy(row) { await store.transport.destroy(row); bump(); },
};
export const resetCustomers = (): void => { store.reset(); bump(); };
export const customerCount = store.count;

/** One customer, reactively: a subscription added or ended reaches every screen that shows it. */
export function customerById(id: number): Customer | undefined {
    version();
    return store.byId(id);
}

/** Every customer, reactively — a service's subscribers are read across all of them. */
export function allCustomers(): readonly Customer[] {
    version();
    return store.all();
}
export const refuseNextArchive = store.refuseNextDestroy;
/** Many at once, in one round trip — what `/customers/import` commits with. */
export const importCustomers = store.createMany;

/**
 * Which columns of a file mean which field of a customer.
 *
 * It lives beside the entity and not on the page: the file a reader exports from this list is the
 * file they will edit and drop back, so the names an import accepts have to be the ones the export
 * writes — and those are the columns' own headers.
 *
 * `reference`, `status` and `since` are deliberately NOT importable: they are the server's to
 * assign, and a file that set them would be a file that can forge a record's history.
 */
export const CUSTOMER_IMPORT_FIELDS: ImportField[] = [
    { name: 'name', required: true, aliases: ['customer', 'company'] },
    { name: 'sector', aliases: ['industry'] },
    { name: 'tier', oneOf: ['standard', 'business', 'enterprise'], aliases: ['level'] },
];
