// The service store: what customers subscribe to, each with an SLA.
//
// A subscription is the customer's (`customers.ts` holds them); a service knows its terms. What
// crosses the two — how many subscribe, who, and which answer time a ticket is owed — is read here,
// the way a server would join them, so no screen does the join itself.
import { signal, type DataRequest, type DataResponse } from '@pdxui/core';
import { createMemoryStore, type StoredRow } from './memory-store';
import { serviceSeed, isCurrent, type ServiceRecord } from './service-seed';
import { allCustomers, customerById, type Customer } from './customers';
import type { AssetKind } from './asset-seed';

export interface Service extends StoredRow, ServiceRecord {
    id: number;
}

/** A service as the list reads it: with the number of customers subscribed to it now. */
export type ServiceRow = Service & { customers: number };

const store = createMemoryStore<Service>({
    seed: serviceSeed,
    create: (values, id) => ({
        id,
        code: String(values.code ?? ''),
        name: String(values.name ?? ''),
        description: String(values.description ?? ''),
        slaHours: Number(values.slaHours ?? 24),
        resolveHours: Number(values.resolveHours ?? 72),
        price: Number(values.price ?? 0),
        active: values.active ?? true,
        covers: Array.isArray(values.covers) ? values.covers : [],
    }),
    refusal: 'The server refused: a service is withdrawn, not deleted.',
    bulkRefusal: 'The server refused this one: the service has subscribers.',
});

/** Bumped on every write, so a screen reading a service through `serviceById` reads it again. */
const version = signal(0);

const today = (): string => new Date().toISOString().slice(0, 10);

/** The customers subscribed to `serviceId` today, with the day each one's subscription started. */
export function subscribersOf(serviceId: number): { customer: Customer; since: string }[] {
    const day = today();
    const out: { customer: Customer; since: string }[] = [];
    for (const customer of allCustomers()) {
        const s = customer.subscriptions.find((x) => x.serviceId === serviceId && isCurrent(x, day));
        if (s) out.push({ customer, since: s.since });
    }
    return out.sort((a, b) => a.customer.name.localeCompare(b.customer.name));
}

export const serviceTransport = {
    ...store.transport,
    /** Each row with its subscriber count, joined as the server answers. Not sortable on it. */
    async read(request: DataRequest): Promise<DataResponse<ServiceRow>> {
        const answer = await store.transport.read(request);
        return { total: answer.total, data: answer.data.map((s) => ({ ...s, customers: subscribersOf(s.id).length })) };
    },
    async update(row: Service): Promise<Service> {
        const saved = await store.transport.update(row);
        version.set((v) => v + 1);
        return saved;
    },
};

/** One service, reactively: a saved edit reaches every screen that shows it. */
export function serviceById(id: number): Service | undefined {
    version();
    return store.byId(id);
}

/** Every service, reactively: a customer's picker offers the active ones. */
export function allServices(): readonly Service[] {
    version();
    return store.all();
}

/**
 * The service whose SLA a ticket is owed: among the customer's current subscriptions, the one with
 * the shortest answer time that COVERS the asset's kind; when none covers it, or the ticket names
 * no asset, the customer's shortest. Null when the customer subscribes to nothing.
 *
 * ASSUMPTION: an inactive service still binds the subscriptions that have it — «inactive» means no
 * longer sold, not no longer honoured.
 */
export function slaFor(customerId: number, kind: AssetKind | null): Service | null {
    const customer = customerById(customerId);
    if (!customer) return null;
    const day = today();
    const current = customer.subscriptions
        .filter((s) => isCurrent(s, day))
        .map((s) => serviceById(s.serviceId))
        .filter((s): s is Service => s !== undefined);
    const covering = kind ? current.filter((s) => s.covers.includes(kind)) : [];
    const pool = covering.length > 0 ? covering : current;
    return [...pool].sort((a, b) => a.slaHours - b.slaHours || a.id - b.id)[0] ?? null;
}
