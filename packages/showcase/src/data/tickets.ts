// The ticket store: what a ticket IS, on the store every entity shares.
//
// Filtering by every operator a filter builder can produce, sorting, paging, a create that assigns
// an id, an update that merges, a destroy that can be refused, and the latency that makes an
// optimistic screen demonstrable say nothing about a ticket. All of that is what a SERVER does, and
// every entity would copy it, so it is `createMemoryStore`, and what is left here is the entity.
//
// `ticketTransport` is the shape the screen reads, and `live.ts` reaches for the
// server-side halves (`createRow`, `updateRow`, `destroyRow`) because a colleague's write is
// another browser's round trip and must not pay this one's latency.
import { createMemoryStore, type StoredRow } from './memory-store';
import { ticketSeed, type TicketRecord } from './seed';

export interface Ticket extends StoredRow, TicketRecord {
    id: number;
}

// The seed is shared with the board, in its own module. `AGENTS` is re-exported so
// the pages that import it from here keep one place to ask.
export { AGENTS } from './seed';

const store = createMemoryStore<Ticket>({
    seed: ticketSeed,

    create: (values, id) => ({
        id,
        reference: `T-${1000 + id}`,
        subject: String(values.subject ?? ''),
        customer: String(values.customer ?? ''),
        customerId: Number(values.customerId ?? 0),
        priority: (values.priority as Ticket['priority']) ?? 'normal',
        status: (values.status as Ticket['status']) ?? 'open',
        assignee: String(values.assignee ?? ''),
        opened: new Date().toISOString().slice(0, 10),
        siteId: Number(values.siteId ?? 0),
        assetId: Number(values.assetId ?? 0),
        categories: Array.isArray(values.categories) ? values.categories.map(String) : [],
    }),

    // What a server says when the caller may not do this. The screen has to survive it, and the
    // refusal is the half of CRUD worth showing.
    refusal: 'The server refused: this ticket is referenced by an open intervention.',
    // The other refusal, and the one an application gets wrong: ONE row of a bulk write, while the
    // rest land. A screen that can only say «it failed» is lying about the nine that went through.
    bulkRefusal: 'The server refused this one: it is locked by another operator.',
});

export const ticketTransport = store.transport;
export const resetTickets = store.reset;
export const ticketCount = store.count;
export const ticketById = store.byId;

/** The tickets opened on an asset, newest first. */
export function ticketsOnAsset(assetId: number): Ticket[] {
    return store.all().filter((t) => t.assetId === assetId).sort((a, b) => b.opened.localeCompare(a.opened) || b.id - a.id);
}

/** The tickets opened at a site, oldest first. A report over the table, as `ticketSummary` is. */
export function ticketsAtSite(siteId: number): Ticket[] {
    return store.all().filter((t) => t.siteId === siteId).sort((a, b) => a.id - b.id);
}

/** What the dashboard asks the server for: counts over the whole table, and the queue. */
export interface TicketSummary {
    byStatus: Record<Ticket['status'], number>;
    byPriority: Record<Ticket['priority'], number>;
    /** Open and nobody on it: the tickets a desk exists to pick up. */
    unassigned: number;
    /** Those same tickets, oldest first — the queue. */
    queue: Ticket[];
}

export function ticketSummary(): TicketSummary {
    const rows = store.all();
    const byStatus = { open: 0, waiting: 0, closed: 0 };
    const byPriority = { low: 0, normal: 0, high: 0 };
    for (const t of rows) {
        byStatus[t.status]++;
        // The load still to do: a closed ticket has no priority left to weigh.
        if (t.status !== 'closed') byPriority[t.priority]++;
    }
    const queue = rows
        .filter((t) => t.status === 'open' && t.assignee === '')
        .sort((a, b) => a.opened.localeCompare(b.opened) || a.id - b.id);
    return { byStatus, byPriority, unassigned: queue.length, queue };
}
/** Make the next archive fail, the way a server refuses one the caller was not allowed to make. */
export const refuseNextDelete = store.refuseNextDestroy;
/** One write for a whole selection, answering per row. */
export const bulkUpdateTickets = store.bulkUpdate;
/** Make the next bulk write refuse its lowest id, the way a server refuses one row and not the rest. */
export const refuseOneOfNextBulk = store.refuseOneOfNextBulk;

// ─── What the SERVER does, without a network in front of it ───────────────────
//
// The transport above is this plus latency, because the latency is the network and the network is
// the page's. A colleague's write in `live.ts` is another browser's round trip, which this
// application does not model and must not pay for: routing it through the transport made the
// server's change land AFTER the user had reconnected, so the event was never missed, the resync
// notice never appeared, and `live-data.spec.ts` measured a race instead of a reconnect.
export const createRow = store.createRow;
export const updateRow = store.updateRow;
export const destroyRow = store.destroyRow;
