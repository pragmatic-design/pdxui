// The half of a CRUD screen's data layer that is not about the entity.
//
// The second entity is what proves a pattern repeats. Filtering by every operator a filter builder
// can produce, sorting, paging, a create that assigns an id, an update that merges, a destroy that
// can be refused, and the latency that makes an optimistic screen demonstrable — all of it is what
// a SERVER does, and an entity that copied it would be repeating the framework's work.
//
// So it is a factory, and an entity is what is left: its type, its seed, and the two lines that
// know how a new record is named.
import { clientGroup, type CompositeFilter, type DataRequest, type DataResponse, type FilterDescriptor, type IDataTransport } from '@pdxui/core';

/** Any row this store can hold: an `id` is what a list, a detail and a delete all need. */
export interface StoredRow extends Record<string, unknown> {
    id: number;
}

export interface MemoryStoreOptions<T extends StoredRow> {
    /** The rows a fresh store holds. Called again by `reset()`, so it must build them each time. */
    seed: () => T[];
    /** Fill a new record from what a form submitted. The store assigns the id. */
    create: (values: Partial<T>, id: number) => T;
    /** What the server says when it refuses a destroy. The screen has to survive it. */
    refusal: string;
    /**
     * What the server says when it refuses ONE ROW of a bulk write.
     *
     * A different sentence from `refusal`, because it is a different event: an all-or-nothing
     * refusal is the easy case and it is already demonstrated. The one an application gets wrong
     * is the MIXED result — nine accepted, three not — and a screen that cannot show it will be
     * written wrong by whoever copies this one.
     */
    bulkRefusal: string;
}

/**
 * What a bulk write actually did, which is not what it was asked to do.
 *
 * Two lists and not a boolean: «it failed» is what an application says when the transport hands it
 * an exception, and it is a lie about a write where most of the rows landed.
 */
export interface BulkOutcome<T> {
    /** The rows as they are NOW, server-side. */
    changed: T[];
    /** The ones that did not move, each with the server's own words. */
    refused: { id: number; reason: string }[];
}

/**
 * How long a WRITE takes to answer. Reads are untouched — every test on a page pays for those.
 *
 * Deliberately slow enough to be seen: an optimistic update whose round trip is instant
 * demonstrates nothing, because the screen would look the same without it. 120ms and not 40
 * because a Playwright `expect.poll` samples from another process, and on a loaded suite that is
 * not a bound to bet a test on.
 */
const WRITE_LATENCY_MS = 120;

/**
 * And longer for the destroy that is going to be REFUSED: that one's intermediate state is the
 * whole demonstration, and it happens once in one test instead of on every write a suite performs.
 */
const REFUSED_LATENCY_MS = 600;

const answerLikeAServer = (ms = WRITE_LATENCY_MS): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One filter, applied the way a server would apply it. */
function matches<T extends StoredRow>(row: T, f: FilterDescriptor): boolean {
    const value = row[f.field];
    // A field that holds a LIST — a record's categories — matches when any of its items
    // does: `eq` is «has this one», `in` «has one of these». Stringified, «hardware,network» would
    // equal nothing and contain its neighbours' codes.
    if (Array.isArray(value)) {
        const items = value.map(String);
        switch (f.operator) {
            case 'eq': return items.includes(String(f.value ?? ''));
            case 'neq': return !items.includes(String(f.value ?? ''));
            case 'in': return Array.isArray(f.value) && (f.value as unknown[]).map(String).some((v) => items.includes(v));
            case 'isnull': return items.length === 0;
            case 'isnotnull': return items.length > 0;
            // contains, startswith…: the text operators, item by item.
            default: return items.some((item) => matches<StoredRow>({ id: row.id, [f.field]: item }, f));
        }
    }
    const text = String(value ?? '').toLowerCase();
    const needle = String(f.value ?? '').toLowerCase();
    switch (f.operator) {
        case 'eq': return String(value ?? '') === String(f.value ?? '');
        case 'neq': return String(value ?? '') !== String(f.value ?? '');
        case 'contains': return text.includes(needle);
        case 'startswith': return text.startsWith(needle);
        case 'endswith': return text.endsWith(needle);
        case 'isnull': return value == null || value === '';
        case 'isnotnull': return value != null && value !== '';
        case 'in': return Array.isArray(f.value) && (f.value as unknown[]).map(String).includes(String(value));
        // Lexicographic on an ISO date and numeric elsewhere, which is what a filterable column
        // needs. An operator this store does not implement KEEPS the row rather than dropping it:
        // a filter nobody wrote must not empty the list.
        case 'gt': return Number(value) > Number(f.value);
        case 'gte': return Number(value) >= Number(f.value);
        case 'lt': return Number(value) < Number(f.value);
        case 'lte': return Number(value) <= Number(f.value);
        default: return true;
    }
}

/** A filter or a composite of them, applied recursively. */
function matchesAny<T extends StoredRow>(row: T, f: FilterDescriptor | CompositeFilter): boolean {
    if ('field' in f) return matches(row, f);
    return f.logic === 'or'
        ? f.filters.some((sub) => matchesAny(row, sub))
        : f.filters.every((sub) => matchesAny(row, sub));
}

export interface MemoryStore<T extends StoredRow> {
    /**
     * The transport a screen hands to `createDataSource`. Its writes are REQUIRED here, where
     * `IDataTransport` has them optional: this store always answers them, and a caller that wraps
     * one (`employees.ts` bumps a version after it) should not have to prove it again.
     */
    transport: IDataTransport<T> & Required<Pick<IDataTransport<T>, 'create' | 'update' | 'destroy'>>;
    /** Back to the seed. A screen offers it, and a test that mutates needs it. */
    reset(): void;
    /** How many rows the store holds, whatever the current page shows. */
    count(): number;
    /** One row by id, for a detail page. */
    byId(id: number): T | undefined;
    /**
     * Every row, for a REPORT the server computes over the whole table — a dashboard's counts. Not
     * for a list: a list pages through `transport` like any screen that shows rows.
     */
    all(): readonly T[];
    /** Make the next destroy fail, the way a server refuses one the caller may not make. */
    refuseNextDestroy(): void;
    /**
     * One write for a whole selection, answering per row: what changed, and what the server would
     * not move, with its reason.
     *
     * ONE round trip, which is what a bulk endpoint is — a loop of single updates is what an
     * application writes when the server offers nothing better, and it is the thing this exists to
     * stop demonstrating.
     */
    bulkUpdate(ids: number[], patch: Partial<T>): Promise<BulkOutcome<T>>;
    /**
     * Many records in ONE round trip — what an import is.
     *
     * A loop of `create()` is what an application writes when the server offers nothing better,
     * and on 200 rows it is 200 round trips and 200 chances to end up half done.
     */
    createMany(list: Partial<T>[]): Promise<T[]>;
    /**
     * Refuse ONE row of the next bulk write: the lowest id in the request, so a test and a reader
     * both know which one before it happens.
     */
    refuseOneOfNextBulk(): void;
    /** What the SERVER does, with no network in front of it — a colleague's write, in `live.ts`. */
    createRow(values: Partial<T>): T;
    updateRow(row: T): T;
    destroyRow(row: T): void;
}

/** An in-memory store that answers like a server, for any entity that has an id. */
export function createMemoryStore<T extends StoredRow>(options: MemoryStoreOptions<T>): MemoryStore<T> {
    let rows: T[] = options.seed();
    let nextId = rows.length + 1;
    let refuse = false;
    let refuseOneBulk = false;

    const createRow = (values: Partial<T>): T => {
        const created = options.create(values, nextId++);
        rows = [created, ...rows];
        return created;
    };

    const updateRow = (row: T): T => {
        rows = rows.map((r) => (r.id === row.id ? { ...r, ...row } : r));
        return rows.find((r) => r.id === row.id)!;
    };

    const destroyRow = (row: T): void => {
        if (refuse) {
            refuse = false;
            throw new Error(options.refusal);
        }
        rows = rows.filter((r) => r.id !== row.id);
    };

    return {
        transport: {
            async read(request: DataRequest): Promise<DataResponse<T>> {
                let result = rows.slice();

                // A composite is an AND or an OR of others. The grid's quick search sends one — an
                // OR of `contains` over the searchable fields — so it is answered like
                // a server would, not skipped.
                for (const f of request.filter ?? []) result = result.filter((r) => matchesAny(r, f));

                for (const s of [...(request.sort ?? [])].reverse()) {
                    result.sort((a, b) => {
                        const av = a[s.field] as string | number, bv = b[s.field] as string | number;
                        const cmp = av === bv ? 0 : (av < bv ? -1 : 1);
                        return s.dir === 'desc' ? -cmp : cmp;
                    });
                }

                const total = result.length;
                // Grouped over every row the filter kept, not over the page: a group's count is the
                // list's, as `createArrayTransport` answers it.
                const groups = request.group && request.group.length > 0 ? clientGroup(result, request.group) : undefined;
                const size = request.pageSize > 0 ? request.pageSize : total;
                const start = (Math.max(1, request.page) - 1) * size;
                return { data: result.slice(start, start + size), total, groups };
            },

            async create(values: Partial<T>): Promise<T> {
                await answerLikeAServer();
                return createRow(values);
            },

            async update(row: T): Promise<T> {
                await answerLikeAServer();
                return updateRow(row);
            },

            async destroy(row: T): Promise<void> {
                // BEFORE the refusal, not after: a rejection that arrives in the microtask it was
                // asked in is the whole defect — the optimistic removal is never painted, and a
                // screen that removes the row and one that waits for the server look identical.
                await answerLikeAServer(refuse ? REFUSED_LATENCY_MS : WRITE_LATENCY_MS);
                destroyRow(row);
            },
        },

        async bulkUpdate(ids: number[], patch: Partial<T>): Promise<BulkOutcome<T>> {
            await answerLikeAServer();
            // Sorted, so «the lowest id» is a promise the caller can rely on rather than an
            // accident of the order the checkboxes were clicked in.
            const wanted = [...ids].sort((a, b) => a - b);
            const denied = refuseOneBulk ? wanted[0] : undefined;
            refuseOneBulk = false;

            const changed: T[] = [];
            const refused: { id: number; reason: string }[] = [];
            for (const id of wanted) {
                const row = rows.find((r) => r.id === id);
                if (!row) continue;
                if (id === denied) { refused.push({ id, reason: options.bulkRefusal }); continue; }
                changed.push(updateRow({ ...row, ...patch } as T));
            }
            return { changed, refused };
        },

        async createMany(list: Partial<T>[]): Promise<T[]> {
            await answerLikeAServer();
            // In file order, which is the order the reader will look for them in.
            return list.map((values) => createRow(values));
        },

        reset(): void { rows = options.seed(); nextId = rows.length + 1; refuse = false; refuseOneBulk = false; },
        count(): number { return rows.length; },
        byId(id: number): T | undefined { return rows.find((r) => r.id === id); },
        all(): readonly T[] { return rows; },
        refuseNextDestroy(): void { refuse = true; },
        refuseOneOfNextBulk(): void { refuseOneBulk = true; },
        createRow,
        updateRow,
        destroyRow,
    };
}
