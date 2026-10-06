// Fake transport — wraps arrayTransport with simulated latency, errors, and logging.
// For demos, prototyping, and integration tests without a real backend.

import type { IDataTransport, DataRequest, DataResponse, ChangeSet } from './transport';
import { arrayTransport } from './array-transport';

export interface FakeTransportOptions<T> {
    /** Initial data. */
    data: T[];
    /** Field used as unique ID. Default: 'id'. */
    idField?: string;
    /** Simulated network latency in ms. Default: 300. 0 = instant. */
    latency?: number;
    /** Random latency jitter (0-1). 0.5 = ±50% of latency. Default: 0.2. */
    jitter?: number;
    /** Probability of random error (0-1). 0.1 = 10% chance. Default: 0. */
    errorRate?: number;
    /** Custom error message for simulated errors. */
    errorMessage?: string;
    /** Log all operations to console. Default: false. */
    log?: boolean;
    /** Callback on each operation (for test assertions). */
    onOperation?: (op: FakeOperation) => void;
}

export interface FakeOperation {
    type: 'read' | 'create' | 'update' | 'patch' | 'destroy' | 'batch';
    request?: DataRequest;
    item?: unknown;
    partial?: unknown;
    timestamp: number;
}

/**
 * {@link arrayTransport} with a simulated network in front: latency, jitter and a configurable error
 * rate.
 *
 * For demos and for tests of the states a real backend produces and an in-memory one never does — a
 * visible loading spinner, an error branch, a race between two requests. `errorRate: 0.1` fails one
 * call in ten, which is how you find out whether the error path was ever written.
 *
 * `onOperation` and `getData()` are the test surface: what was asked, and what the store holds now.
 */
export function fakeTransport<T extends Record<string, unknown>>(
    options: FakeTransportOptions<T>,
): IDataTransport<T> & { /** Access the internal data for assertions. */ getData(): Promise<T[]> } {
    const inner = arrayTransport({
        data: options.data,
        idField: options.idField,
    });
    const latency = options.latency ?? 300;
    const jitter = options.jitter ?? 0.2;
    const errorRate = options.errorRate ?? 0;
    const shouldLog = options.log ?? false;

    function delay(): Promise<void> {
        if (latency === 0) return Promise.resolve();
        const variation = latency * jitter;
        const ms = latency + (Math.random() * 2 - 1) * variation;
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
    }

    function maybeError(op: string): void {
        if (errorRate > 0 && Math.random() < errorRate) {
            throw new Error(options.errorMessage ?? `[FakeTransport] Simulated ${op} error`);
        }
    }

    /**
     * Report an operation to the console (when `log`) and to `onOperation`. `fields` carries what
     * FakeOperation declares for this kind of call — `request` for a read, `partial` for a patch — kept
     * apart from `detail`, which goes to `item`, so `op.request.filter` is there for the test that asks
     * "what did the screen send".
     */
    function log(op: FakeOperation['type'], detail?: unknown, fields: Pick<FakeOperation, 'request' | 'partial'> = {}): void {
        if (shouldLog) console.log(`[FakeTransport] ${op}`, detail ?? '');
        options.onOperation?.({
            type: op,
            item: detail,
            ...fields,
            timestamp: Date.now(),
        });
    }

    async function read(request: DataRequest): Promise<DataResponse<T>> {
        log('read', { page: request.page, pageSize: request.pageSize, sort: request.sort, filter: request.filter }, { request });
        await delay();
        maybeError('read');
        return inner.read(request);
    }

    async function create(item: Partial<T>): Promise<T> {
        log('create', item);
        await delay();
        maybeError('create');
        return inner.create!(item);
    }

    async function update(item: T): Promise<T> {
        log('update', item);
        await delay();
        maybeError('update');
        return inner.update!(item);
    }

    async function patch(id: unknown, partial: Partial<T>): Promise<T> {
        log('patch', { id, partial }, { partial });
        await delay();
        maybeError('patch');
        return inner.patch!(id, partial);
    }

    async function destroy(item: T): Promise<void> {
        log('destroy', item);
        await delay();
        maybeError('destroy');
        return inner.destroy!(item);
    }

    async function batchSync(changes: ChangeSet<T>): Promise<ChangeSet<T>> {
        log('batch', { added: changes.added.length, updated: changes.updated.length, removed: changes.removed.length });
        await delay();
        maybeError('batch');
        return inner.batch!(changes);
    }

    // Expose internal data for test assertions (sync — arrayTransport is sync internally)
    async function getData(): Promise<T[]> {
        const r = await inner.read({ page: 1, pageSize: 0, sort: [], filter: [] });
        return r.data;
    }

    return { read, create, update, patch, destroy, batch: batchSync, getData };
}
