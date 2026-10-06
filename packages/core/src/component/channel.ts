// Component Communication — typed bidirectional channels and command dispatchers.
//
// Patterns:
//   expose()        → parent calls child methods (via lifecycle.ts scope)
//   createChannel() → typed bidirectional communication
//   createCommands() → parent sends imperative commands down

// ─── Channel ──────────────────────────────────────────────────────

/**
 * Typed bidirectional channel between parent and child.
 *
 * Usage:
 *   // Define contract
 *   interface GridChannel {
 *     down: { refresh: void; scrollTo: { row: number } };
 *     up: { rowSelected: { id: string }; sorted: { col: string } };
 *   }
 *
 *   // Parent side
 *   const ch = createChannel<GridChannel>();
 *   ch.send('refresh');
 *   ch.on('rowSelected', ({ id }) => { ... });
 *
 *   // Child side (via prop or inject)
 *   ch.on('refresh', () => reloadData());
 *   ch.emit('rowSelected', { id: '123' });
 */

type ChannelContract = {
    down: Record<string, unknown>;
    up: Record<string, unknown>;
};

/** Listener callback type. */
type Listener<T = unknown> = (payload: T) => void;

export interface Channel<T extends ChannelContract> {
    /** Send a command DOWN to child (parent calls this). */
    send<K extends keyof T['down']>(
        event: K,
        ...args: T['down'][K] extends void ? [] : [payload: T['down'][K]]
    ): void;

    /** Emit an event UP to parent (child calls this). */
    emit<K extends keyof T['up']>(
        event: K,
        ...args: T['up'][K] extends void ? [] : [payload: T['up'][K]]
    ): void;

    /** Listen for commands DOWN (child calls this). */
    on<K extends keyof T['down']>(event: K, fn: Listener<T['down'][K]>): () => void;
    /** Listen for events UP (parent calls this, overload). */
    on<K extends keyof T['up']>(event: K, fn: Listener<T['up'][K]>): () => void;

    /** Remove a listener. */
    off(event: string, fn: Listener): void;

    /** Dispose all listeners. */
    dispose(): void;
}

/**
 * Create a typed bidirectional channel.
 * Messages are validated by TypeScript at compile time.
 * At runtime, listeners are stored per-event, frozen for security.
 *
 * CONSTRAINT: send (down) and emit (up) share one listener map, keyed by event
 * NAME — give `down` and `up` distinct names in the contract ('refresh' vs 'refreshed', say), or
 * the listeners receive the messages of both directions.
 */
export function createChannel<T extends ChannelContract>(): Channel<T> {
    const listeners = new Map<string, Set<Listener>>();

    function getSet(event: string): Set<Listener> {
        let s = listeners.get(event);
        if (!s) { s = new Set(); listeners.set(event, s); }
        return s;
    }

    // Implementation uses 'any' internally — type safety enforced by Channel<T> interface
    const channel = {
        send(event: string & keyof T['down'], ...args: unknown[]) {
            const set = listeners.get(event);
            if (set) for (const fn of set) fn(args[0]);
        },

        emit(event: string & keyof T['up'], ...args: unknown[]) {
            const set = listeners.get(event);
            if (set) for (const fn of set) fn(args[0]);
        },

        on(event: string, fn: Listener): () => void {
            const set = getSet(event);
            set.add(fn);
            return () => set.delete(fn);
        },

        off(event: string, fn: Listener) {
            listeners.get(event)?.delete(fn);
        },

        dispose() {
            listeners.clear();
        },
    } as Channel<T>;

    return Object.freeze(channel);
}

// ─── Commands (simplified one-way parent→child) ──────────────────

export interface Commands<T extends Record<string, unknown>> {
    /** Send a command to the child. */
    send<K extends keyof T>(
        command: K,
        ...args: T[K] extends void ? [] : [payload: T[K]]
    ): void;

    /** Listen for commands (child side). */
    on<K extends keyof T>(command: K, fn: Listener<T[K]>): () => void;

    /** Remove listener. */
    off(command: string, fn: Listener): void;

    /** Dispose all listeners. */
    dispose(): void;
}

/**
 * Create a typed command dispatcher (parent→child direction only).
 * Simpler than a full channel when bidirectional is not needed.
 */
export function createCommands<T extends Record<string, unknown>>(): Commands<T> {
    const listeners = new Map<string, Set<Listener>>();

    function getSet(event: string): Set<Listener> {
        let s = listeners.get(event);
        if (!s) { s = new Set(); listeners.set(event, s); }
        return s;
    }

    const commands = {
        send(command: string & keyof T, ...args: unknown[]) {
            const set = listeners.get(command);
            if (set) for (const fn of set) fn(args[0]);
        },

        on(command: string, fn: Listener): () => void {
            const set = getSet(command);
            set.add(fn);
            return () => set.delete(fn);
        },

        off(command: string, fn: Listener) {
            listeners.get(command)?.delete(fn);
        },

        dispose() {
            listeners.clear();
        },
    } as Commands<T>;

    return Object.freeze(commands);
}

// ─── Expose helper ────────────────────────────────────────────────

/**
 * Expose methods/signals on the host element for parent access via ref.
 * Each entry becomes a read-only, non-configurable own property (external code can't reassign).
 *
 * Copies property DESCRIPTORS (not a spread), so a live `get x()` accessor stays live instead of
 * being snapshotted to its value at expose time — e.g. a component whose `get form()` is filled in
 * after mount keeps returning the current value.
 *
 * Called from component setup: ctx.expose({ showModal, close, isOpen })
 */
export function exposeOnElement(
    element: HTMLElement,
    api: Record<string, unknown>
): void {
    for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(api))) {
        // configurable:true so the property can be REDEFINED when the element is disconnected and reconnected
        // (setup re-runs in connectedCallback → expose() runs again). With configurable:false a reconnect — e.g.
        // a drawer portaling its children to <body> — threw "Cannot redefine property". Still getter-only /
        // writable:false, so external code cannot reassign via `el.x = y`.
        if (desc.get || desc.set) {
            // Accessor: keep the getter live, drop any setter → read-only from outside.
            Object.defineProperty(element, key, { get: desc.get, configurable: true, enumerable: true });
        } else {
            Object.defineProperty(element, key, { value: desc.value, writable: false, configurable: true, enumerable: true });
        }
    }
}
