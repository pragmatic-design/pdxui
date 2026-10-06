/** A reactive value that can be read (call) and written (set). */
export interface Signal<T> {
    /** Read the current value (tracks dependencies). */
    (): T;
    /** Write a new value or update via function. set(fn) treats fn as updater. */
    set(value: T | ((prev: T) => T)): void;
    /** Write a value directly, never treating functions as updaters. */
    setRaw(value: T): void;
    /** Read without tracking dependencies. */
    peek(): T;
}

/** A read-only reactive value derived from other signals. */
export interface ReadonlySignal<T> {
    /** Read the current value (tracks dependencies). */
    (): T;
    /** Read without tracking dependencies. */
    peek(): T;
}

/** A signal with undo/redo history tracking. */
export interface HistorySignal<T> extends Signal<T> {
    /** Undo the last change. */
    undo(): void;
    /** Redo the last undone change. */
    redo(): void;
    /** Get the full history of values. */
    history(): T[];
    /** Whether undo is available (reactive). */
    canUndo: ReadonlySignal<boolean>;
    /** Whether redo is available (reactive). */
    canRedo: ReadonlySignal<boolean>;
}

/** Options for signal creation. */
export interface SignalOptions<T = unknown> {
    /** Enable undo/redo history tracking. */
    history?: boolean;
    /** Debug name for DevTools inspector. */
    name?: string;
    /**
     * What counts as a change, in place of `Object.is`.
     *
     * Called with the value held and the value being written, in that order. Returning true means
     * the write is not a change, so it does NOT happen: nothing is stored and nobody is notified.
     * It replaces the identity check, and that check decides the write rather than the
     * notification alone — so a reader holding the old value by identity keeps pointing at it.
     *
     * `Object.is` is the right default and the wrong answer for a value rebuilt on every write: a
     * parsed query string, a DTO from a response, an array mapped out of a store. Identical in
     * every way a reader cares about, and a notification all the same.
     */
    equals?: (prev: T, next: T) => boolean;
}

/** Function that cleans up a side effect. */
export type Dispose = () => void;

/** A subscriber callback. */
export type Subscriber = () => void;
