// Offline middleware — queues mutations when offline, replays on reconnect.
//
// Security:
//   - Queue size capped to prevent memory exhaustion
//   - Requests are deep-cloned before queueing (no reference leaks)
//   - Headers are preserved as-is for auth token replay
//
// Performance:
//   - GET requests pass through (cache layer handles offline reads)
//   - Queue stored in-memory by default; IndexedDB optional for persistence
//   - Replay is sequential FIFO (preserves causal ordering)

import type { HttpMiddleware, HttpRequest, HttpResponse, HttpHandler } from './types';
import { OfflineError } from './types';

// ─── Types ─────────────────────────────────────────────────────────

export interface OfflineMiddlewareOptions {
    /** Max queued requests (default: 50). Oldest discarded when exceeded. */
    maxQueueSize?: number;
    /** Persist queue to IndexedDB across page reloads (default: false). */
    persist?: boolean;
    /** IndexedDB database name (default: 'pdx-offline'). */
    dbName?: string;
    /** Called for each replayed request (success or error). */
    onReplay?: (request: HttpRequest, result: HttpResponse | Error) => void;
    /** Called when a request is queued. */
    onQueued?: (request: HttpRequest, queueSize: number) => void;
}

interface QueueEntry {
    request: HttpRequest;
    timestamp: number;
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ─── offlineMiddleware ─────────────────────────────────────────────

/**
 * Queues mutations made while offline and replays them, in order, on reconnect.
 *
 * Only POST/PUT/PATCH/DELETE are queued: a GET fails fast so the cache can answer it instead of
 * being replayed later against a page that has moved on. Replay is sequential FIFO, because the
 * order of two writes to the same record is the difference between the right value and the wrong
 * one.
 *
 * The queue is capped (50 by default) and drops the OLDEST when full — bounded memory beats a
 * complete history, and a request from an hour ago is the one most likely to conflict. Requests are
 * deep-cloned on the way in, so a caller mutating its own object afterwards cannot change what gets
 * replayed. `persist: true` survives a reload via IndexedDB.
 *
 * Replayed requests carry their ORIGINAL headers, including a bearer token that may have expired by
 * the time they are sent. `onReplay` is where you find out.
 */
export function offlineMiddleware(options: OfflineMiddlewareOptions = {}): HttpMiddleware {
    const maxSize = options.maxQueueSize ?? 50;
    const persist = options.persist ?? false;
    const dbName = options.dbName ?? 'pdx-offline';

    const queue: QueueEntry[] = [];
    let replaying = false;
    /**
     * The drain in progress, so a request that arrives mid-drain can wait for it.
     *
     * `replaying` alone only says THAT one is running; a new mutation needs something to await, or
     * it goes out while older writes are still queued behind it.
     */
    let draining: Promise<void> | null = null;
    let handler: HttpHandler | null = null; // captured from first call
    let listenerAttached = false;

    // Deep-clone a request for safe queueing (no shared references)
    function cloneRequest(req: HttpRequest): HttpRequest {
        return {
            method: req.method,
            url: req.url,
            headers: { ...req.headers },
            body: req.body !== undefined ? structuredClone(req.body) : undefined,
            signal: undefined, // signals can't be cloned — will use fresh controller on replay
            meta: { ...req.meta },
        };
    }

    // Enqueue a request
    function enqueue(request: HttpRequest): void {
        // Cap queue size — drop oldest
        while (queue.length >= maxSize) queue.shift();
        queue.push({ request: cloneRequest(request), timestamp: Date.now() });
        options.onQueued?.(request, queue.length);

        if (persist) persistQueue();
    }

    /**
     * Replay all queued requests sequentially.
     *
     * Returns the drain rather than starting a second one when one is already running, so every
     * caller — the `online` handler, the restore path, and a mutation that must not overtake the
     * queue — awaits the same work.
     */
    function replayQueue(next: HttpHandler): Promise<void> {
        if (replaying) return draining ?? Promise.resolve();
        if (queue.length === 0) return Promise.resolve();
        replaying = true;

        draining = (async () => {
            try {
                while (queue.length > 0) {
                    // Check we're still online before each request
                    if (typeof navigator !== 'undefined' && !navigator.onLine) break;

                    const entry = queue.shift()!;
                    try {
                        const response = await next(entry.request);
                        options.onReplay?.(entry.request, response);
                    } catch (err) {
                        options.onReplay?.(entry.request, err instanceof Error ? err : new Error(String(err)));
                        // Don't re-queue — the request failed, caller should handle via onReplay
                    }
                }

                if (persist) persistQueue(); // clear persisted queue
            } finally {
                replaying = false;
                draining = null;
            }
        })();

        return draining;
    }

    // Attach online listener (once)
    function attachListener(next: HttpHandler): void {
        if (listenerAttached || typeof window === 'undefined') return;
        listenerAttached = true;

        window.addEventListener('online', () => {
            replayQueue(next);
        });
    }

    // IndexedDB persistence (simple key-value via one object store)
    async function persistQueue(): Promise<void> {
        if (typeof indexedDB === 'undefined') return;
        try {
            const db = await openDb(dbName);
            const tx = db.transaction('queue', 'readwrite');
            const store = tx.objectStore('queue');
            await promisify(store.clear());
            for (let i = 0; i < queue.length; i++) {
                store.put({ id: i, ...queue[i] });
            }
            db.close();
        } catch {
            // IndexedDB failure is non-critical — queue stays in memory
        }
    }

    async function restoreQueue(): Promise<void> {
        if (typeof indexedDB === 'undefined') return;
        try {
            const db = await openDb(dbName);
            const tx = db.transaction('queue', 'readonly');
            const store = tx.objectStore('queue');
            const all = await promisify<QueueEntry[]>(store.getAll());
            for (const entry of all) {
                if (entry.request && entry.timestamp) {
                    queue.push({ request: entry.request, timestamp: entry.timestamp });
                }
            }
            db.close();
        } catch {
            // Non-critical
        }
    }

    // Read the persisted queue back NOW, not on the first request: the entries have to be in the
    // queue before anything decides what to do with a new one, or a mutation made straight after a
    // reload jumps ahead of the ones the user made before it.
    const restored: Promise<void> = persist ? restoreQueue() : Promise.resolve();
    let restoredDrained = false;

    // The middleware
    const middleware: HttpMiddleware = async (request, next) => {
        // Capture handler for replay
        if (!handler) handler = next;
        attachListener(next);

        // A queue read back from IndexedDB is not a queue that was sent.
        //
        // Restoring is not enough: the replay runs only from the `online` EVENT, which a page that
        // loads already-online never sees. Without this drain, mutations persisted while offline
        // sit in IndexedDB through the reload, through the next request the app makes, and go out
        // only when the device happens to drop and come back. `persist: true` promises
        // that the queue survives a reload; surviving and never being sent is not surviving.
        //
        // The drain is AWAITED, and that is the point rather than an oversight: the restored entries
        // are older than the request in hand, and FIFO across a reload is only a guarantee if the
        // new request waits. It costs the first request after a reload the backlog it inherited, and
        // only when there is one — `replayQueue` also stops the moment the device is offline again.
        if (persist && !restoredDrained) {
            restoredDrained = true;
            await restored;
            if (queue.length > 0 && (typeof navigator === 'undefined' || navigator.onLine)) {
                await replayQueue(next);
            }
        }

        // GET/HEAD/OPTIONS pass through — cache layer handles offline reads
        if (!MUTATION_METHODS.has(request.method)) {
            return next(request);
        }

        // Check if online
        const isOnline = typeof navigator === 'undefined' || navigator.onLine;
        if (isOnline) {
            // A mutation issued WHILE THE QUEUE IS DRAINING must not overtake it.
            //
            // The device reconnects, the `online` handler starts replaying three queued writes, the
            // user saves a fourth — sent straight out, the fourth could reach the server first. Two writes to the same record in the wrong order leave the wrong value,
            // which is the exact failure FIFO exists to prevent.
            //
            // Of the three ways out, this is the one that keeps the caller's semantics: the promise
            // still settles with this request's own result, at the call site, instead of arriving
            // in `onReplay` or being rejected with an `OfflineError` the device does not deserve.
            // It costs latency on one call, and only while a backlog is in front of it — the same
            // trade, for the same reason, as the restored-queue drain above.
            //
            // A non-empty queue with no drain running counts too: the entries are still older.
            if (replaying || queue.length > 0) await replayQueue(next);
            return next(request);
        }

        // Offline: queue the mutation
        enqueue(request);
        throw new OfflineError(request);
    };

    return middleware;
}

// ─── IndexedDB helpers ─────────────────────────────────────────────

function openDb(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore('queue', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function promisify<T = unknown>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
