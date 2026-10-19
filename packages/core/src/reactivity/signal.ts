// Fine-grained reactivity — optimized for throughput.
//
// Optimizations applied:
// 1. Array-based subscribers (no Set hash overhead for typical <10 subscribers)
// 2. Pre-allocated flush array (no spread [...pendingEffects] per cycle)
// 3. Minimal branching on hot path (read/set)
// 4. Glitch-free flush, once per write or per batch(), with error boundary
// 5. Effect dep tracking via array (not Set) for fast unsubscribe

import { DEV } from '../utils/env';
import type { Signal, ReadonlySignal, HistorySignal, SignalOptions, Subscriber, Dispose } from '../utils/types';
import { registerSignal, registerEffect, noteEffectDeps, unregisterEffect, registerReactiveNode, nameSubscriber, notifyTrace, effectRunTrace, emitDevTools, flushStart, flushEnd, trackError, trackCycleDetection } from '../debug/inspector';
import { dispatchGlobalError, ownerContext } from '../component/global-error';
import { devOwnedNode, devRecordError } from '../debug/devtools-api';

let currentEffect: Subscriber | null = null;
let batchDepth = 0;

/**
 * Bumped each time the flush guard breaks a loop.
 *
 * A computed notifies once and then waits, dirty, for the reader it notified: `markDirty` returns
 * early while dirty on that promise. Breaking a loop drops the queue those readers were in, so the
 * promise is broken for every computed dirtied in that flush. A computed remembers the epoch it went
 * dirty in, and one dirtied before a break is not trusted to have a reader coming: its next
 * notification goes through.
 */
let flushEpoch = 0;

// --- Dev guardrails ---
let _devMode = false;
let _insideComputed = false;
const _warnedReads = new Set<string>(); // avoid duplicate warnings

/** Enable dev mode guardrails (signal read outside tracking, write in computed). */
export function enableDevMode(on = true): void { _devMode = on; }

// --- Error routes (for error boundaries) ---
// An entry is either a handler — a boundary building its content — or an OWNER: the host element of
// a component that is mounting. An owner is resolved to a handler only when an error happens, by
// looking for the boundary that encloses it in the DOM: a component renders when it connects, which
// is after the boundary that contains it has finished building and popped its handler.
type ErrorHandler = (err: unknown) => void;
type ErrorRoute = ErrorHandler | object;
const errorHandlerStack: ErrorRoute[] = [];
let ownerResolver: ((owner: object) => ErrorHandler | null) | null = null;

/** Push an error handler onto the stack. Effects that throw propagate to this handler. */
export function pushErrorHandler(handler: (err: unknown) => void): void {
    errorHandlerStack.push(handler);
}

/** Pop the top error handler. */
export function popErrorHandler(): void {
    errorHandlerStack.pop();
}

/** Push an error owner — the node a mounting component renders into. Effects created until the
 *  matching `popErrorOwner` report to the boundary that encloses that node when they throw. */
export function pushErrorOwner(owner: object): void {
    errorHandlerStack.push(owner);
}

/** Pop the top error owner. */
export function popErrorOwner(): void {
    errorHandlerStack.pop();
}

/** Install the function that finds the boundary enclosing an owner. The renderer layer does it:
 *  the reactivity layer knows nothing about the DOM. */
export function setErrorOwnerResolver(resolve: (owner: object) => ErrorHandler | null): void {
    ownerResolver = resolve;
}

function resolveRoute(route: ErrorRoute | null | undefined): ErrorHandler | null {
    if (!route) return null;
    if (typeof route === 'function') return route as ErrorHandler;
    return ownerResolver ? ownerResolver(route) : null;
}

/** Get the top error handler (if any). Used by safeHandler to try local boundaries first. */
export function getTopErrorHandler(): ErrorHandler | null {
    return errorHandlerStack.length > 0 ? resolveRoute(errorHandlerStack[errorHandlerStack.length - 1]) : null;
}

// --- «Maybe dirty» (#115) ---
// A computed without `equals` notifies its readers before it knows whether its value changed: the
// notification is a MAYBE. An effect queued only that way is checked before it runs — the computeds
// it read last time are brought up to date and compared — and does not run when none changed. An
// effect queued by a signal it reads directly is DEFINITE, and runs.
/** True while a computed is notifying its readers: what it schedules is a «maybe». */
let notifyingMaybe = false;
/**
 * An effect queued by a direct write since it last ran (or was skipped) carries this flag, and
 * runs. A property rather than a Set: it is set and read once per queued effect, on the hot path.
 */
type Flagged = Subscriber & { __pdx_definite?: boolean };
/** The computeds the running effect reads, with the value each gave it. Null outside an effect. */
let currentComputedReads: [() => unknown, unknown][] | null = null;

// --- Pending effects: array-based for zero-alloc flush ---
let pendingArr: Subscriber[] = [];
let pendingLen = 0;
const pendingSeen = new Set<Subscriber>(); // dedup guard

function enqueuePending(sub: Subscriber): void {
    if (pendingSeen.has(sub)) return;
    pendingSeen.add(sub);
    if (pendingLen >= pendingArr.length) pendingArr.push(sub);
    else pendingArr[pendingLen] = sub;
    pendingLen++;
}

// --- Scope ---
let currentCleanups: (() => void)[] | null = null;

// --- Dependency tracking (#116) ---
// A reader — an effect's run, a computed's markDirty — keeps its dependency list BETWEEN runs and
// updates it in place: a source read again at the same position costs nothing, a source read twice
// in one run is recorded once, and only a source that stopped being read is unsubscribed. Before, a
// run detached from every source and re-attached as it read, and every read pushed an entry.

/** One reader's dependencies: the list, and where this run is in it. */
interface Tracker {
    readonly sub: Subscriber;
    /**
     * The sources, in the order the last run read them. Kept, and rewritten in place: during a run
     * `deps[0..cursor)` is what this run has read, without repeats.
     */
    readonly deps: Set<Subscriber>[];
    /** How far into `deps` this run has read. */
    cursor: number;
    /** Sources a read moved out of their place, checked at the end of the run. */
    readonly displaced: Set<Subscriber>[];
    /** True while the run is in progress. */
    active: boolean;
}

function newTracker(sub: Subscriber): Tracker {
    return { sub, deps: [], cursor: 0, displaced: [], active: false };
}

/** The tracker of the reader running now, or null: what a read records itself into. */
let currentTracker: Tracker | null = null;

/** Whether this run has read `source` already: it is in `deps[0..cursor)`. */
function readThisRun(t: Tracker, source: Set<Subscriber>): boolean {
    for (let i = 0; i < t.cursor; i++) if (t.deps[i] === source) return true;
    return false;
}

/** A run begins: the list is kept, the run's own bookkeeping is reset. */
function beginTracking(t: Tracker): void {
    t.cursor = 0;
    // Written only when it changes: a store to `length` takes V8's slow path even with the same
    // value, and it was over half of a computed chain's recompute (measured with --cpu-prof).
    if (t.displaced.length !== 0) t.displaced.length = 0;
    t.active = true;
}

/**
 * `source` was read by the run `t` is tracking. The common case — the same source in the same
 * place as last run — is one comparison. Only a read that changes the list looks back through what
 * this run read, to record a repeated source once: an array scan, which for the few sources a
 * reader has costs less than a Set (measured: a Set per run cost a chain of computeds ~40%).
 */
function track(t: Tracker, source: Set<Subscriber>): void {
    // In the same place as last run: already subscribed, nothing to do.
    if (t.deps[t.cursor] === source) { t.cursor++; return; }
    if (readThisRun(t, source)) return;
    if (t.cursor < t.deps.length) t.displaced.push(t.deps[t.cursor]);
    t.deps[t.cursor++] = source;
    // Set.add on a member does not move it: an unchanged subscription keeps its place in the
    // source's live Set, which notifySet iterates (see its INVARIANT).
    source.add(t.sub);
}

/** A run ends: whatever it did not read again stops notifying it. */
function endTracking(t: Tracker): void {
    t.active = false;
    // The common case: the same sources, nothing moved — nothing to do (and no `length` store).
    if (t.cursor === t.deps.length && t.displaced.length === 0) return;
    for (let i = t.cursor; i < t.deps.length; i++) t.displaced.push(t.deps[i]);
    t.deps.length = t.cursor;
    for (let i = 0; i < t.displaced.length; i++) {
        const source = t.displaced[i];
        if (!readThisRun(t, source)) source.delete(t.sub);
    }
    t.displaced.length = 0;
}

/** An effect's run carries its tracker, for the self-scheduling rule in {@link scheduleSubscriber}. */
type Tracked = Subscriber & { __pdx_tracker?: Tracker };

/** Register a cleanup function for the current effect. */
export function onCleanup(fn: () => void): void {
    if (currentCleanups) currentCleanups.push(fn);
}

// --- Ownership scope ---
// Collects disposers of reactive constructs created during a render so the
// enclosing scope (component body, when/match branch, repeat item) can tear them
// down when its DOM subtree is removed. Without this, every removed subtree leaks
// its effects: they stay subscribed and re-run forever on detached nodes.
//
// A scope can also be SUSPENDED (#269): a frozen page — a kept-alive route left by navigation, a
// `<component :is @keepAlive>` instance switched away — costs no CPU. The flush parks an effect whose
// scope, or a scope above it, is suspended, and resuming runs each parked effect once. Framework
// timers and polling follow through the hooks of {@link onScopeSuspension}.

/** An ownership scope: what it disposes, the scope it was created under, and whether it is suspended. */
export interface OwnerScope {
    /** The scope this one was created under: suspending that one holds this one too. */
    readonly parent: OwnerScope | null;
    /** What disposing the scope runs. */
    readonly disposers: Dispose[];
    suspended: boolean;
    /** The effects that came due while it was suspended, run once when it resumes. */
    parked: Set<Subscriber> | null;
    /** How many suspension hooks are registered on it: removed when it is disposed. */
    hooks: number;
}

/** An effect knows the scope it was created in, as it knows its error route. */
type Scoped = Subscriber & { __pdx_scope?: OwnerScope | null };

let currentOwner: OwnerScope | null = null;

/** How many scopes are suspended now. While none is, the flush checks nothing. */
let suspendedCount = 0;

/**
 * The scope a construct created now belongs to: the one being collected, or — in a flush, where none
 * is — the scope of the effect running, as an effect created there inherits its error route.
 */
export function currentScope(): OwnerScope | null {
    return currentOwner ?? ((currentEffect as Scoped | null)?.__pdx_scope ?? null);
}

/** The nearest suspended scope from `scope` up, or null when it runs. */
function suspendedFrom(scope: OwnerScope | null | undefined): OwnerScope | null {
    for (let s = scope; s; s = s.parent) if (s.suspended) return s;
    return null;
}

/** Whether `scope`, or a scope above it, is suspended. */
export function isScopeSuspended(scope: OwnerScope | null): boolean {
    return suspendedCount !== 0 && suspendedFrom(scope) !== null;
}

/**
 * Register a disposer with the current ownership scope (if any).
 * For constructs that manage their own teardown (e.g. repeat() items) and need a
 * disposer to fire only on scope teardown, never on effect re-run. No-op outside
 * a collectDisposers() scope.
 */
export function onDispose(fn: Dispose): void {
    if (currentOwner) currentOwner.disposers.push(fn);
}

/**
 * Run `fn` while collecting every effect/disposer created within it; return the
 * result together with a single idempotent Dispose that tears them all down.
 * Nested scopes compose: disposing an outer scope disposes the effects it owns,
 * whose own cleanups dispose their inner scopes recursively.
 */
export function collectDisposers<T>(fn: () => T): [T, Dispose] {
    const prev = currentOwner;
    const scope: OwnerScope = { parent: currentScope(), disposers: [], suspended: false, parked: null, hooks: 0 };
    currentOwner = scope;
    try {
        const result = fn();
        const owned = scope.disposers;
        const dispose: Dispose = () => {
            // Disposed while suspended — a frozen page destroyed: nothing is held any more.
            if (scope.suspended) { scope.suspended = false; suspendedCount--; }
            scope.parked = null;
            if (scope.hooks !== 0) removeHooksOf(scope);
            for (let i = 0; i < owned.length; i++) owned[i]();
            owned.length = 0;
        };
        return [result, dispose];
    } finally {
        currentOwner = prev;
    }
}

/** {@link collectDisposers}, and the scope it collected into: what a container suspends. */
export function collectScope<T>(fn: () => T): [T, Dispose, OwnerScope] {
    let scope!: OwnerScope;
    const [result, dispose] = collectDisposers(() => { scope = currentOwner!; return fn(); });
    return [result, dispose, scope];
}

/** Run `fn` with `scope` as the current one: what it creates belongs to that scope. */
export function runInScope<T>(scope: OwnerScope, fn: () => T): T {
    const prev = currentOwner;
    currentOwner = scope;
    try { return fn(); } finally { currentOwner = prev; }
}

/** A construct that pauses with its scope: polling, a framework timer. */
interface SuspensionHook {
    readonly scope: OwnerScope;
    readonly suspend: () => void;
    readonly resume: () => void;
}
const suspensionHooks = new Set<SuspensionHook>();

/**
 * Pause and resume with `scope`: `suspend` runs when the scope (or one above it) is suspended,
 * `resume` when it runs again. Internal — the framework's polling and timers use it; a developer's
 * own timer belongs in an effect, which is paused with its page. Removed when the scope is disposed,
 * or by the returned function. Registered while the scope is suspended, `suspend` runs at once.
 */
export function onScopeSuspension(scope: OwnerScope, suspend: () => void, resume: () => void): Dispose {
    const hook: SuspensionHook = { scope, suspend, resume };
    suspensionHooks.add(hook);
    scope.hooks++;
    if (isScopeSuspended(scope)) suspend();
    return () => { if (suspensionHooks.delete(hook)) scope.hooks--; };
}

/** Remove the hooks registered on a scope being disposed. */
function removeHooksOf(scope: OwnerScope): void {
    for (const hook of suspensionHooks) if (hook.scope === scope) suspensionHooks.delete(hook);
    scope.hooks = 0;
}

/** The hooks whose scope is running now, before a scope changes state. */
function runningHooks(): SuspensionHook[] {
    const out: SuspensionHook[] = [];
    for (const hook of suspensionHooks) if (!isScopeSuspended(hook.scope)) out.push(hook);
    return out;
}

/** The hooks whose scope is held now. */
function heldHooks(): SuspensionHook[] {
    const out: SuspensionHook[] = [];
    for (const hook of suspensionHooks) if (isScopeSuspended(hook.scope)) out.push(hook);
    return out;
}

/**
 * Suspend `scope`: from now its effects, and those of the scopes under it, are parked instead of
 * run, and the framework's polling and timers under it pause.
 */
export function suspendScope(scope: OwnerScope): void {
    if (scope.suspended) return;
    const running = suspensionHooks.size === 0 ? [] : runningHooks();
    scope.suspended = true;
    suspendedCount++;
    for (const hook of running) if (isScopeSuspended(hook.scope)) hook.suspend();
}

/**
 * Resume `scope`: each effect parked while it was suspended runs once — and only if what it reads
 * changed, as any queued effect — then the polling and timers under it start again.
 */
export function resumeScope(scope: OwnerScope): void {
    if (!scope.suspended) return;
    const held = suspensionHooks.size === 0 ? [] : heldHooks();
    scope.suspended = false;
    suspendedCount--;
    const parked = scope.parked;
    scope.parked = null;
    if (parked) {
        // Their flags are kept: one queued by a direct write runs, a «maybe» is checked first. One
        // still held by another suspended scope above is parked there.
        for (const sub of parked) enqueuePending(sub);
        if (batchDepth === 0) flush();
    }
    // After the parked effects: a source refreshed on resume sees the request they started.
    for (const hook of held) if (!isScopeSuspended(hook.scope)) hook.resume();
}

// --- Untracked ---

/**
 * Read signals without tracking dependencies.
 * Inside an effect/computed, reads performed in the callback won't create subscriptions.
 *
 * Usage:
 *   effect(() => {
 *     const tracked = count();          // subscribes
 *     const silent = untracked(() => other()); // does NOT subscribe
 *   });
 */
export function untracked<T>(fn: () => T): T {
    const prev = currentEffect;
    const prevTracker = currentTracker;
    currentEffect = null;
    currentTracker = null;
    try { return fn(); }
    finally { currentEffect = prev; currentTracker = prevTracker; }
}

// --- Signal ---

/**
 * A value that tells its readers when it changes. The unit everything reactive in PDX is built from.
 *
 * Reading is calling it: `count()`. Writing is `count.set(next)` or `count.set(v => v + 1)`. Any
 * {@link effect} or `computed` that read it during its last run re-runs when it changes; nothing
 * else does, so there is no diffing and no dependency array to keep correct.
 *
 * Each write outside {@link batch} flushes at once: its subscribers run before `set` returns. Writes
 * that must be seen together — two fields of one state — go inside `batch()`, so a subscriber never
 * observes the state half-updated.
 *
 * In a `.pdx` file you rarely call this — `let count = $signal(0)` compiles to it, and `count++`
 * compiles to the `.set`.
 *
 * `{ history: true }` returns a {@link HistorySignal} that remembers previous values for undo/redo;
 * `{ equals }` replaces the identity check that decides whether a write is a change at all — and
 * it decides the WRITE, not just the notification: a value it calls equal is never stored, so a
 * reader holding the old one by identity keeps pointing at it. For a value rebuilt on every write
 * (a parsed query, a DTO, an array mapped from a store) `Object.is` says «changed» every time, and
 * on a page where such a value round-trips that is a loop with nothing to stop it.
 */
export function signal<T>(initial: T): Signal<T>;
export function signal<T>(initial: T, options: SignalOptions<T> & { history: true }): HistorySignal<T>;
export function signal<T>(initial: T, options: SignalOptions<T>): Signal<T>;
export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> | HistorySignal<T> {
    if (options?.history) return createHistorySignal(initial, options?.name, options?.equals);
    return createSignal(initial, options?.name, options?.equals);
}

/** Core signal factory — optimized hot path with Set subscribers for correctness. */
function createSignal<T>(initial: T, debugName?: string, equals?: (prev: T, next: T) => boolean): Signal<T> {
    let value = initial;
    const subscribers = new Set<Subscriber>();
    const name = debugName ?? '';
    /** The one question both writers ask: is this a change? `Object.is` unless told otherwise. */
    const unchanged = (next: T): boolean => (equals ? equals(value, next) : Object.is(value, next));

    if (name) registerSignal(name, () => value, () => subscribers.size);

    const read = () => {
        const t = currentTracker;
        if (t) {
            // The common case inline — the same source where the last run read it — and the rest
            // in track().
            if (t.deps[t.cursor] === subscribers) t.cursor++;
            else track(t, subscribers);
        } else if (DEV && _devMode && name && !_warnedReads.has(name)) {
            // Dev guardrail: signal read outside reactive tracking
            _warnedReads.add(name);
            console.warn(
                `[pdx:dev] Signal "${name}" read outside reactive context (effect/computed). ` +
                'This read won\'t update when the signal changes. Wrap in effect() or computed().'
            );
        }
        return value;
    };

    read.set = (next: T | ((prev: T) => T)) => {
        if (DEV && _devMode && _insideComputed) {
            console.warn(
                `[pdx:dev] Signal "${name || 'anonymous'}" written inside computed(). ` +
                'Computed values should be pure — move the mutation to an effect().'
            );
        }
        const resolved = typeof next === 'function'
            ? (next as (prev: T) => T)(value) : next;
        if (unchanged(resolved)) return;
        const oldValue = value;
        value = resolved;
        if (name) {
            notifyTrace(name, oldValue, resolved);
            emitDevTools('signal:change', { name, oldValue, newValue: resolved });
        }
        notifySet(subscribers);
    };

    // setRaw: always store the value directly, never treat as updater function.
    // Use for props that may hold function values (callbacks, templates).
    read.setRaw = (next: T) => {
        if (unchanged(next)) return;
        const oldValue = value;
        value = next;
        if (name) {
            notifyTrace(name, oldValue, next);
            emitDevTools('signal:change', { name, oldValue, newValue: next });
        }
        notifySet(subscribers);
    };

    read.peek = () => value;

    // The accessor and its subscriber Set, so `__pdx_debug.deps` can name this signal when a
    // computed lists it, and `__pdx_debug.subscribers` can say who is listening.
    registerReactiveNode(read, name || '(unnamed)', subscribers);
    // Created in a component's setup: part of that instance's state for `inspect()`.
    if (DEV && name) devOwnedNode('state', name, read);

    return read as Signal<T>;
}

// --- History Signal ---

function createHistorySignal<T>(initial: T, debugName?: string, equals?: (prev: T, next: T) => boolean): HistorySignal<T> {
    const inner = createSignal(initial, debugName, equals);
    const stack: T[] = [initial];
    let cursor = 0;
    const _canUndo = createSignal(false);
    const _canRedo = createSignal(false);

    function updateFlags(): void {
        _canUndo.set(cursor > 0);
        _canRedo.set(cursor < stack.length - 1);
    }

    // HistorySignal is assembled imperatively (function + attached methods) then
    // cast at return; a precise type here would fight every method assignment.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig: any = () => inner();
    sig.set = (next: T | ((prev: T) => T)): void => {
        const resolved = typeof next === 'function'
            ? (next as (prev: T) => T)(inner.peek()) : next;
        // The same question the signal asks, asked here too: a write the rule calls equal must
        // not push an undo step either, or Ctrl+Z walks back through states nothing changed.
        const prev = inner.peek();
        if (equals ? equals(prev, resolved) : Object.is(prev, resolved)) return;
        stack.length = cursor + 1;
        stack.push(resolved);
        cursor++;
        inner.set(resolved);
        updateFlags();
    };
    sig.peek = () => inner.peek();
    sig.undo = (): void => { if (cursor > 0) { cursor--; inner.set(stack[cursor]); updateFlags(); } };
    sig.redo = (): void => { if (cursor < stack.length - 1) { cursor++; inner.set(stack[cursor]); updateFlags(); } };
    sig.history = (): T[] => [...stack];
    sig.canUndo = computed(() => _canUndo()) as ReadonlySignal<boolean>;
    sig.canRedo = computed(() => _canRedo()) as ReadonlySignal<boolean>;
    return sig as HistorySignal<T>;
}

// --- Computed ---

/** Options for computed signal. */
export interface ComputedOptions<T> {
    /** Custom equality check — return true if values are "same" (skip notification). Default: Object.is. */
    equals?: (prev: T, next: T) => boolean;
    /**
     * A name for the inspector, the way `signal(value, 'name')` takes one.
     *
     * Without it a computed is an anonymous function in every reading, and «what depends on this
     * signal» answers with a list of `(anonymous)`.
     */
    name?: string;
}

/**
 * Derived signal — lazy recomputation with dirty flag + optional equality.
 *
 * A source change makes it dirty and tells its readers «maybe»: an effect that read it is checked
 * before it runs, and runs only if this computed — recomputed then — gives another value
 * (`Object.is`). With `equals` it recomputes at once and tells its readers only of a change.
 */
export function computed<T>(fn: () => T, options?: ComputedOptions<T>): ReadonlySignal<T> {
    let cached: T;
    let dirty = true;
    let initialized = false;
    let disposed = false;
    /** The flush epoch `dirty` was set in — see {@link flushEpoch}. */
    let dirtyEpoch = 0;
    const subscribers = new Set<Subscriber>();
    const equals = options?.equals;
    // The source Sets markDirty is registered with, kept between recomputes and updated in place
    // (#116): an unchanged dependency is never deleted and re-added. That matters beyond the cost —
    // a delete then re-add moves the entry to the END of that source's subscriber Set; notifySet
    // iterates the LIVE Set and JS visits entries appended during iteration, so markDirty would run
    // again, find `dirty` reset by this very recompute, re-enter and loop forever (with `equals`,
    // which recomputes INSIDE the notification pass, that hangs the process).
    // `tracker` is declared after markDirty below, the subscriber it tracks for; recompute only
    // runs once it exists.

    function recompute(): void {
        const prev = currentEffect;
        const prevTracker = currentTracker;
        const prevInsideComputed = _insideComputed;
        // What this computed reads is its own dependency, not the effect's that read it.
        const prevComputedReads = currentComputedReads;
        // Once disposed, it recomputes WITHOUT re-subscribing to the sources — a late
        // read must not bring the computed back to life — and stays dirty, since nothing will
        // tell it that a source changed: every read recomputes, as a plain getter would (#342).
        currentEffect = disposed ? null : markDirty;
        currentTracker = disposed ? null : tracker;
        if (!disposed) beginTracking(tracker);
        currentComputedReads = null;
        _insideComputed = true;
        try { cached = fn(); dirty = disposed; initialized = true; }
        finally {
            currentEffect = prev; currentTracker = prevTracker; _insideComputed = prevInsideComputed;
            currentComputedReads = prevComputedReads;
            // Deps read only conditionally last time stop notifying this computed.
            if (!disposed) endTracking(tracker);
        }
    }

    const markDirty = () => {
        if (disposed) return;
        // Already dirty means a reader is already on its way — unless a broken flush threw that
        // reader away, in which case waiting for it is waiting forever.
        if (!dirty || dirtyEpoch !== flushEpoch) {
            dirty = true;
            dirtyEpoch = flushEpoch;
            if (equals && initialized) {
                // Eagerly recompute to check equality before notifying downstream
                const oldCached = cached;
                recompute();
                if (equals(oldCached, cached)) return; // same value — don't propagate
                // It did change, and it knows: what it schedules runs.
                const prevMaybe = notifyingMaybe;
                notifyingMaybe = false;
                try { notifySet(subscribers); } finally { notifyingMaybe = prevMaybe; }
                return;
            }
            // Not recomputed yet: its readers MAY see a new value. Each is checked before it runs.
            const prevMaybe = notifyingMaybe;
            notifyingMaybe = true;
            try { notifySet(subscribers); } finally { notifyingMaybe = prevMaybe; }
        }
    };
    // The inspector's two readings: what this computed last READ, and — through
    // `markDirty`, which is what a source holds — who is listening to a source. `deps` is read
    // lazily, so the list is always the last run's rather than a snapshot of some earlier one.
    const debugName = options?.name ?? '';
    nameSubscriber(markDirty, debugName || '(anonymous computed)');

    // Tag so notifySet propagates this synchronously instead of queuing it as an effect.
    (markDirty as { __pdx_mark?: boolean }).__pdx_mark = true;
    const tracker = newTracker(markDirty);

    // Lazy: nothing is computed until the first read (`dirty` starts true). Computing eagerly here,
    // at creation, would make a `$derived` declared before what its expression reads throw a TDZ
    // ReferenceError at mount, whatever order the author wrote, because the compiler cannot emit
    // setup in source order. A computed nobody reads never runs and never subscribes; its deps
    // are collected on the first read, by the same tracking as recompute.

    const read = () => {
        const t = currentTracker;
        if (t) {
            if (t.deps[t.cursor] === subscribers) t.cursor++;
            else track(t, subscribers);
        }
        if (dirty) recompute();
        // The running effect remembers the value it was given, to tell a «maybe» from a change.
        if (currentEffect && currentComputedReads) currentComputedReads.push([read.peek, cached]);
        return cached;
    };

    read.peek = () => {
        if (dirty) recompute();
        return cached;
    };

    /**
     * Unsubscribe from every source and stop notifying downstream.
     *
     * The ownership scope below does this when a subtree unmounts; this is the same thing by hand,
     * for a computed created outside a scope — and it is what makes «a disposed computed stops
     * being a subscriber» something a test can state. A read afterwards still answers: it
     * recomputes, untracked, every time (#342).
     */
    read.dispose = () => {
        if (disposed) return;
        disposed = true;
        dirty = true;
        for (let i = 0; i < tracker.deps.length; i++) tracker.deps[i].delete(markDirty);
        tracker.deps.length = 0;
        subscribers.clear();
    };

    // The inspector, both ways: `deps` is a GETTER over the live list, so the answer
    // is always the last run's, and the subscriber Set makes this computed answerable too.
    registerReactiveNode(read, debugName || '(anonymous computed)', subscribers, () => tracker.deps, () => dirty);
    if (DEV && debugName) devOwnedNode('derived', debugName, read);

    // An ownership scope: without a disposer, a computed created in a subtree that is
    // then unmounted stays subscribed to its sources forever (a retention leak) and — with
    // `equals` — keeps recomputing eagerly on every source change. Computeds
    // created outside a scope (modules/singletons) stay permanent.
    if (currentOwner) currentOwner.disposers.push(read.dispose);

    return read as ReadonlySignal<T>;
}

// --- Effect ---

export interface EffectOptions {
    /**
     * A name for the inspector: what `effects()`, the trace and a signal's subscribers call it. The
     * compiler passes `file.pdx:line` for a `$effect` or `$watch` in a development build.
     */
    name?: string;
}

/**
 * Run a function now, and again whenever a signal it read has changed.
 *
 * Dependencies are collected by RUNNING it: whatever the function reads this time is what it is
 * subscribed to next time. A read behind an `if` that was false is not a dependency — which is what
 * makes conditional reactivity work without declaring anything.
 *
 * Returning a function registers cleanup: it runs before each re-run AND on dispose, which is where
 * a listener or a timer belongs so it cannot outlive the effect that created it. The returned
 * `Dispose` stops it; inside a component the ownership scope disposes it with the subtree, so you
 * usually do not have to.
 *
 * For a value derived from other values use `computed` — an effect that only assigns to a signal is
 * a computed written the long way round.
 */
export function effect(fn: () => void | (() => void), options?: EffectOptions): Dispose {
    let cleanups: (() => void)[] = [];
    let disposed = false;
    // The sources this effect reads, kept between runs (#116): `tracker`, declared once `run` exists.
    /** The computeds the last run read, with their values: what a «maybe» is checked against. */
    const computedReads: [() => unknown, unknown][] = [];

    // Capture the error route active WHEN THIS EFFECT IS CREATED. Async errors (thrown
    // during a later flush) must route to the boundary that wraps this effect's subtree, not
    // to whatever boundary happens to be top-of-stack at throw time — which may be a different,
    // possibly sibling, boundary. With nothing on the stack, an effect created while
    // another runs — the branch an `@if` renders later — inherits that effect's route.
    const boundaryHandler: ErrorRoute | null = errorHandlerStack.length > 0
        ? errorHandlerStack[errorHandlerStack.length - 1]
        : ((currentEffect as { __pdx_errh?: ErrorRoute } | null)?.__pdx_errh ?? null);

    const run = () => {
        if (disposed) return;
        for (let i = 0; i < cleanups.length; i++) cleanups[i]();
        cleanups = [];

        // Its subscriptions are kept and updated as it reads, not dropped and re-taken (#116).
        // While it runs, a source it has not read yet in this run does not schedule it — as when
        // it detached from everything first (scheduleSubscriber).
        const prevEffect = currentEffect;
        const prevCleanups = currentCleanups;
        const prevTracker = currentTracker;
        const prevComputedReads = currentComputedReads;
        // Reused, not reallocated: an effect re-runs on the hot path. And `length` written only when
        // it changes — the store is slow even with the same value (see beginTracking).
        if (computedReads.length !== 0) computedReads.length = 0;
        beginTracking(tracker);
        currentEffect = run;
        currentCleanups = cleanups;
        currentTracker = tracker;
        currentComputedReads = computedReads;
        try {
            const result = fn();
            if (typeof result === 'function') cleanups.push(result);
        } finally {
            currentEffect = prevEffect;
            currentCleanups = prevCleanups;
            currentTracker = prevTracker;
            currentComputedReads = prevComputedReads;
            endTracking(tracker);
            if (inspected) noteEffectDeps(inspected.record, tracker.deps);
        }
    };
    const tracker = newTracker(run);
    (run as Tracked).__pdx_tracker = tracker;

    /**
     * Whether a «maybe» is a change: true when a computed the last run read now gives another value.
     * Reading it brings it up to date. With nothing recorded there is nothing to compare, and it runs.
     */
    // Declared here, with the check, so the function keeps one shape: the flag added later, on the
    // first write, would change it on the hot path.
    (run as Flagged).__pdx_definite = false;
    (run as { __pdx_check?: () => boolean }).__pdx_check = () => {
        if (computedReads.length === 0) return true;
        for (let i = 0; i < computedReads.length; i++) {
            const [peek, seen] = computedReads[i];
            if (!Object.is(peek(), seen)) return true;
        }
        return false;
    };

    if (boundaryHandler) (run as { __pdx_errh?: ErrorRoute }).__pdx_errh = boundaryHandler;
    // The scope it belongs to, captured like the error route: the flush parks it while that scope is
    // suspended (#269).
    (run as Scoped).__pdx_scope = currentScope();
    // The name the trace reports, and the registry entry `effects()` lists — the latter only at
    // telemetry level 2, like signals.
    const name = options?.name;
    if (name) (run as { __pdx_name?: string }).__pdx_name = name;
    const inspected = registerEffect(name ?? '(anonymous)', run);
    run();

    const dispose: Dispose = () => {
        if (disposed) return;
        disposed = true;
        if (inspected) unregisterEffect(inspected.id);
        for (let i = 0; i < cleanups.length; i++) cleanups[i]();
        cleanups = [];
        for (let i = 0; i < tracker.deps.length; i++) tracker.deps[i].delete(run);
        tracker.deps.length = 0;
    };
    // Register with the enclosing ownership scope so removed subtrees dispose
    // their effects (idempotent — safe even if also disposed explicitly).
    if (currentOwner) currentOwner.disposers.push(dispose);
    return dispose;
}

// --- Batch ---

/**
 * Group writes so subscribers run once, after all of them.
 *
 * Outside it each write flushes at once, so two writes in a row run their subscribers twice, and the
 * first run sees the second value not yet written. Use it when several writes are one change.
 * A compiled template's event handlers already run inside it (`batchHandler`); code anywhere
 * else — a hand-written listener, a timer, a promise callback — flushes per write.
 *
 * Nested calls flush once, at the outermost exit.
 */
export function batch(fn: () => void): void {
    batchDepth++;
    try { fn(); }
    finally {
        batchDepth--;
        if (batchDepth === 0) flush();
    }
}

/**
 * `handler`, run inside `batch()` on every call: what a compiled template does with each of its
 * `@event` handlers (#114), so a handler writing three signals runs an effect reading them once,
 * on the finished state. The call keeps its `this` and returns what the handler returns — the
 * promise of an async handler, which is batched up to its first `await`.
 */
export function batchHandler<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R {
    return function (this: unknown, ...args: A): R {
        let result!: R;
        batch(() => { result = handler.apply(this, args); });
        return result;
    };
}

// --- Internal: Notification + Flush ---

/**
 * Schedule a single subscriber.
 * Computeds are lazy: their `markDirty` marks the cached value stale and propagates the
 * dirtiness to ITS subscribers synchronously — it must NOT go through the effect queue.
 * Queuing it there would re-schedule effects that are already in the current flush, so an
 * effect reading both a signal and a signal-derived computed would run twice per set (and could
 * read a stale computed if it ran before the mark). Only effects (leaf subscribers) are
 * queued, each once; effects always recompute the computed lazily on read → glitch-free.
 *
 * An effect that is running keeps its subscriptions from the last run (#116), but it is scheduled
 * only by a `source` it has read in THIS run: written before it is read again, the source does not
 * schedule it — what happened when a run first detached from every source.
 */
function scheduleSubscriber(sub: Subscriber, source: Set<Subscriber>): void {
    if ((sub as { __pdx_mark?: boolean }).__pdx_mark) sub();
    else {
        const t = (sub as Tracked).__pdx_tracker;
        if (t !== undefined && t.active && !readThisRun(t, source)) return;
        // Queued by a direct write, not by a computed's «maybe»: it runs, unchecked.
        if (!notifyingMaybe) (sub as Flagged).__pdx_definite = true;
        enqueuePending(sub);
    }
}

/**
 * Whether a queued effect is to run. Definite: yes. A «maybe»: only if a computed it read changed.
 * A check that throws — a computed whose recompute throws — runs the effect, which reads the same
 * computed and throws where the error is routed to its boundary.
 */
function shouldRun(sub: Subscriber): boolean {
    if ((sub as Flagged).__pdx_definite) {
        (sub as Flagged).__pdx_definite = false;
        return true;
    }
    const check = (sub as { __pdx_check?: () => boolean }).__pdx_check;
    if (!check) return true;
    try { return check(); } catch { return true; }
}

/**
 * Notify all subscribers. Uses pre-allocated pending array for zero-alloc flush.
 *
 * INVARIANT — this iterates the LIVE Set, so anything invoked synchronously from here
 * (today: only `__pdx_mark` computeds) MUST NOT delete-then-re-add itself to a subscriber
 * Set. A delete+add moves the entry to the end of the Set and JS re-visits entries appended
 * during iteration → the subscriber runs again and loops forever. A `computed({ equals })` that
 * did so would hang the process (not a slow test: a dead worker). Effects are safe because they
 * are QUEUED and flushed over a snapshot array.
 * Pinned by the re-entrancy probes in tests/reactivity-review-fixes.test.ts.
 */
function notifySet(subscribers: Set<Subscriber>): void {
    if (batchDepth > 0) {
        for (const sub of subscribers) scheduleSubscriber(sub, subscribers);
    } else {
        // try/finally, as batch(): a subscriber that runs here may throw (a computed with `equals`
        // recomputes to compare). The error still reaches the writer, but the depth comes back
        // down and what was scheduled still flushes; left raised, no effect would ever run again
        // (#102).
        batchDepth++;
        try {
            for (const sub of subscribers) scheduleSubscriber(sub, subscribers);
        } finally {
            batchDepth--;
            if (batchDepth === 0) flush();
        }
    }
}

/** Max flush iterations before assuming infinite loop. */
const MAX_FLUSH_ITERATIONS = 100;

/** Pool of reusable subscriber arrays — avoids allocation per flush cycle. */
const flushPool: Subscriber[][] = [];

/**
 * Flush all pending effects. Reuses array for zero-alloc cycles.
 * Error boundary: one failing effect doesn't block others.
 * Cycle guard: stops after MAX_FLUSH_ITERATIONS to prevent infinite loops.
 */
function flush(): void {
    let iterations = 0;
    const startTime = flushStart();
    while (pendingLen > 0) {
        if (++iterations > MAX_FLUSH_ITERATIONS) {
            trackCycleDetection();
            console.error(
                `[pdx] Infinite reactive loop detected (${MAX_FLUSH_ITERATIONS} flush cycles). ` +
                'This usually means an effect writes to a signal it reads. Breaking cycle.'
            );
            // The dropped effects lose their «definite» flag with their place in the queue.
            for (let i = 0; i < pendingLen; i++) (pendingArr[i] as Flagged).__pdx_definite = false;
            pendingLen = 0;
            pendingSeen.clear();
            // The readers just dropped were the ones every dirty computed was waiting for.
            flushEpoch++;
            break;
        }

        const len = pendingLen;
        const arr = pendingArr;
        // Fresh array for next cycle (effects may enqueue more during execution)
        pendingArr = flushPool.length > 0 ? flushPool.pop()! : [];
        pendingLen = 0;
        pendingSeen.clear();

        // Raised while this round runs, and lowered whatever escapes it: an effect's error is
        // caught below, but the handler it is routed to can itself throw (#102).
        batchDepth++;
        try {
            for (let i = 0; i < len; i++) {
                // Held by a suspended scope (#269): parked, with its flags, until the scope resumes.
                if (suspendedCount !== 0) {
                    const held = suspendedFrom((arr[i] as Scoped).__pdx_scope);
                    if (held !== null) { (held.parked ??= new Set()).add(arr[i]); continue; }
                }
                // A «maybe» whose computeds all kept their value has nothing new to see (#115).
                if (!shouldRun(arr[i])) continue;
                const effectName = (arr[i] as { __pdx_name?: string }).__pdx_name ?? 'anonymous';
                try {
                    effectRunTrace(effectName);
                    arr[i]();
                } catch (err) {
                    trackError(effectName, err);
                    // Prefer the route captured at THIS effect's creation (correct owner) — a
                    // boundary, or the boundary enclosing its component NOW; fall back to the
                    // current stack, then the global handler.
                    const route = (arr[i] as { __pdx_errh?: ErrorRoute }).__pdx_errh;
                    // Listed for the devtools whichever handler takes it.
                    if (DEV) {
                        const owner = ownerContext(route);
                        devRecordError(err, 'effect', owner.component, owner.file);
                    }
                    const owned = resolveRoute(route);
                    const handler = owned ?? getTopErrorHandler();
                    if (handler) {
                        handler(err);
                    } else {
                        // An effect a component created names it: its route is that element.
                        dispatchGlobalError(err, { source: 'effect', ...ownerContext(route) });
                    }
                }
            }
        } finally {
            batchDepth--;
        }
        // Return array to pool for reuse (clear refs, cap pool size)
        arr.length = 0;
        if (flushPool.length < 4) flushPool.push(arr);
    }
    flushEnd(startTime);
}

// --- Ref ---

/**
 * A signal for a DOM element, starting as `null`.
 *
 * The target of `:ref="el"` in a template: the element is assigned when it mounts, so reading it
 * before that gives `null` rather than a stale node. Use it instead of `document.getElementById` —
 * PDX renders into the light DOM, so ids are neither unique nor available when `onMount` runs.
 */
export function ref<T = HTMLElement>(): Signal<T | null> {
    return createSignal<T | null>(null);
}

/** Expose current listener for testing. */
export function _getCurrentEffect(): Subscriber | null {
    return currentEffect;
}
