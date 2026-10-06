// Typed event bus for cross-component communication.
// Optional event store for debugging and hydration replay.

/** A single recorded event (when store is enabled). */
export interface EventRecord<T = unknown> {
    event: string;
    payload: T;
    timestamp: number;
}

/** Typed event bus for inter-component communication. */
export interface EventBus<T extends Record<string, unknown> = Record<string, unknown>> {
    /** Emit an event with payload. For void events, payload is omitted. */
    emit<K extends keyof T & string>(event: K, payload?: T[K]): void;
    /** Subscribe to an event. Returns unsubscribe function. */
    on<K extends keyof T & string>(event: K, handler: (payload: T[K]) => void): () => void;
    /** Unsubscribe a specific handler from an event. */
    off<K extends keyof T & string>(event: K, handler: (payload: T[K]) => void): void;
    /** Get event history (requires store: true). Returns [] if store not enabled. */
    history(): EventRecord[];
    /** Replay all stored events to current handlers (requires store: true). No-op without store. */
    replay(): void;
    /** Clear event history. */
    clear(): void;
}

/** Options for createBus. */
export interface BusOptions {
    /** Enable event history store for replay/debugging. */
    store?: boolean;
}

/**
 * Creates a typed event bus for inter-component communication.
 *
 * Usage:
 *   interface AppEvents {
 *       'cart:add': { productId: number; qty: number };
 *       'cart:remove': { productId: number };
 *       'auth:logout': void;
 *   }
 *   const bus = createBus<AppEvents>();
 *   bus.emit('cart:add', { productId: 123, qty: 1 });
 *   const unsub = bus.on('cart:add', (item) => console.log(item));
 *
 * With store (for debugging/replay):
 *   const bus = createBus<AppEvents>({ store: true });
 *   bus.history();   // → all emitted events
 *   bus.replay();    // → re-emits to current handlers
 */
export function createBus<T extends Record<string, unknown> = Record<string, unknown>>(
    options?: BusOptions
): EventBus<T> {
    const handlers = new Map<string, Set<(payload: unknown) => void>>();
    const store: EventRecord[] = [];
    const storeEnabled = options?.store ?? false;

    function getSet(event: string): Set<(payload: unknown) => void> {
        if (!handlers.has(event)) handlers.set(event, new Set());
        return handlers.get(event)!;
    }

    function dispatch(event: string, payload: unknown): void {
        const set = handlers.get(event);
        if (set) {
            for (const fn of set) fn(payload);
        }
    }

    return {
        emit<K extends keyof T & string>(event: K, payload?: T[K]): void {
            if (storeEnabled) {
                store.push({ event, payload, timestamp: Date.now() });
            }
            dispatch(event, payload);
        },

        on<K extends keyof T & string>(event: K, handler: (payload: T[K]) => void): () => void {
            // Stored with an unknown payload (the typed boundary is this signature).
            const h = handler as (payload: unknown) => void;
            getSet(event).add(h);
            return () => { getSet(event).delete(h); };
        },

        off<K extends keyof T & string>(event: K, handler: (payload: T[K]) => void): void {
            handlers.get(event)?.delete(handler as (payload: unknown) => void);
        },

        history(): EventRecord[] {
            return [...store];
        },

        replay(): void {
            for (const { event, payload } of store) {
                dispatch(event, payload);
            }
        },

        clear(): void {
            store.length = 0;
        },
    };
}
