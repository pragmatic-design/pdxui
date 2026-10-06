// Fine-grained reactivity — optimized for throughput.
//
// Optimizations applied:
// 1. Array-based subscribers (no Set hash overhead for typical <10 subscribers)
// 2. Pre-allocated flush array (no spread [...pendingEffects] per cycle)
// 3. Minimal branching on hot path (read/set)
// 4. Glitch-free auto-batch with error boundary
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

// --- Effect dep tracking: sets of subscriber Sets for cleanup on dispose ---
let currentDeps: Set<Subscriber>[] | null = null;

/** Register a cleanup function for the current effect. */
export function onCleanup(fn: () => void): void {
    if (currentCleanups) currentCleanups.push(fn);
}

// --- Ownership scope ---
// Collects disposers of reactive constructs created during a render so the
// enclosing scope (component body, when/match branch, repeat item) can tear them
// down when its DOM subtree is removed. Without this, every removed subtree leaks
// its effects: they stay subscribed and re-run forever on detached nodes.
let currentOwner: Dispose[] | null = null;

/**
 * Register a disposer with the current ownership scope (if any).
 * For constructs that manage their own teardown (e.g. repeat() items) and need a
 * disposer to fire only on scope teardown, never on effect re-run. No-op outside
 * a collectDisposers() scope.
 */
export function onDispose(fn: Dispose): void {
    if (currentOwner) currentOwner.push(fn);
}

/**
 * Run `fn` while collecting every effect/disposer created within it; return the
 * result together with a single idempotent Dispose that tears them all down.
 * Nested scopes compose: disposing an outer scope disposes the effects it owns,
 * whose own cleanups dispose their inner scopes recursively.
 */
export function collectDisposers<T>(fn: () => T): [T, Dispose] {
    const prev = currentOwner;
    const owned: Dispose[] = [];
    currentOwner = owned;
    try {
        const result = fn();
        const dispose: Dispose = () => {
            for (let i = 0; i < owned.length; i++) owned[i]();
            owned.length = 0;
        };
        return [result, dispose];
    } finally {
        currentOwner = prev;
    }
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
    currentEffect = null;
    try { return fn(); }
    finally { currentEffect = prev; }
}

// --- Signal ---

/**
 * A value that tells its readers when it changes. The unit everything reactive in PDX is built from.
 *
 * Reading is calling it: `count()`. Writing is `count.set(next)` or `count.set(v => v + 1)`. Any
 * {@link effect} or `computed` that read it during its last run re-runs when it changes; nothing
 * else does, so there is no diffing and no dependency array to keep correct.
 *
 * Writes are auto-batched: several mutations in the same synchronous turn produce ONE flush, so a
 * subscriber never observes a half-updated state. {@link batch} is for the cases where you need to
 * say so explicitly.
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
        if (currentEffect) {
            subscribers.add(currentEffect);
            if (currentDeps) currentDeps.push(subscribers);
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

/** Derived signal — lazy recomputation with dirty flag + optional equality. */
export function computed<T>(fn: () => T, options?: ComputedOptions<T>): ReadonlySignal<T> {
    let cached: T;
    let dirty = true;
    let initialized = false;
    let disposed = false;
    /** The flush epoch `dirty` was set in — see {@link flushEpoch}. */
    let dirtyEpoch = 0;
    const subscribers = new Set<Subscriber>();
    const equals = options?.equals;
    // Source signal subscriber-Sets that markDirty is registered with.
    // Pruned before each recompute so deps read only conditionally last time
    // don't keep this computed subscribed (mirrors effect's dep cleanup).
    let deps: Set<Subscriber>[] = [];

    function recompute(): void {
        // Track into a FRESH list, then prune only the deps that were not re-tracked.
        //
        // Pruning up-front (delete markDirty from every dep, then let fn() re-add it) looks
        // equivalent but is not: an unchanged dep gets deleted and re-added, which moves the
        // entry to the END of that source's subscriber Set. notifySet iterates the LIVE Set,
        // and JS visits entries appended during iteration — so markDirty would run again, find
        // `dirty` already reset by this very recompute, re-enter, and loop forever.
        // With `equals` (which recomputes INSIDE the notification pass) that hangs the process.
        const prevTracked = deps;
        const nextDeps: Set<Subscriber>[] = [];

        const prev = currentEffect;
        const prevDeps = currentDeps;
        const prevInsideComputed = _insideComputed;
        // Once disposed, it recomputes WITHOUT re-subscribing to the sources — a late
        // read must not bring the computed back to life.
        currentEffect = disposed ? null : markDirty;
        currentDeps = disposed ? null : nextDeps;
        _insideComputed = true;
        try { cached = fn(); dirty = false; initialized = true; }
        finally { currentEffect = prev; currentDeps = prevDeps; _insideComputed = prevInsideComputed; }

        // Deps read only conditionally last time must stop notifying this computed.
        for (let i = 0; i < prevTracked.length; i++) {
            const dep = prevTracked[i];
            if (!nextDeps.includes(dep)) dep.delete(markDirty);
        }
        deps = nextDeps;
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
            }
            notifySet(subscribers);
        }
    };
    // The inspector's two readings: what this computed last READ, and — through
    // `markDirty`, which is what a source holds — who is listening to a source. `deps` is read
    // lazily, so the list is always the last run's rather than a snapshot of some earlier one.
    const debugName = options?.name ?? '';
    nameSubscriber(markDirty, debugName || '(anonymous computed)');

    // Tag so notifySet propagates this synchronously instead of queuing it as an effect.
    (markDirty as { __pdx_mark?: boolean }).__pdx_mark = true;

    // Lazy: nothing is computed until the first read (`dirty` starts true). Computing eagerly here,
    // at creation, would make a `$derived` declared before what its expression reads throw a TDZ
    // ReferenceError at mount, whatever order the author wrote, because the compiler cannot emit
    // setup in source order. A computed nobody reads never runs and never subscribes; its deps
    // are collected on the first read, by the same tracking as recompute.

    const read = () => {
        if (currentEffect) {
            subscribers.add(currentEffect);
            if (currentDeps) currentDeps.push(subscribers);
        }
        if (dirty) recompute();
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
     * being a subscriber» something a test can state.
     */
    read.dispose = () => {
        if (disposed) return;
        disposed = true;
        for (let i = 0; i < deps.length; i++) deps[i].delete(markDirty);
        deps = [];
        subscribers.clear();
    };

    // The inspector, both ways: `deps` is a GETTER over the live list, so the answer
    // is always the last run's, and the subscriber Set makes this computed answerable too.
    registerReactiveNode(read, debugName || '(anonymous computed)', subscribers, () => deps, () => dirty);
    if (DEV && debugName) devOwnedNode('derived', debugName, read);

    // An ownership scope: without a disposer, a computed created in a subtree that is
    // then unmounted stays subscribed to its sources forever (a retention leak) and — with
    // `equals` — keeps recomputing eagerly on every source change. Computeds
    // created outside a scope (modules/singletons) stay permanent.
    if (currentOwner) {
        currentOwner.push(() => {
            if (disposed) return;
            disposed = true;
            for (let i = 0; i < deps.length; i++) deps[i].delete(markDirty);
            deps = [];
            subscribers.clear();
        });
    }

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
    let deps: Set<Subscriber>[] = [];

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

        // Unsubscribe from all tracked subscriber sets
        for (let i = 0; i < deps.length; i++) deps[i].delete(run);
        deps = [];

        const prevEffect = currentEffect;
        const prevCleanups = currentCleanups;
        const prevDeps = currentDeps;
        currentEffect = run;
        currentCleanups = cleanups;
        currentDeps = deps;
        try {
            const result = fn();
            if (typeof result === 'function') cleanups.push(result);
        } finally {
            currentEffect = prevEffect;
            currentCleanups = prevCleanups;
            currentDeps = prevDeps;
            if (inspected) noteEffectDeps(inspected.record, deps);
        }
    };

    if (boundaryHandler) (run as { __pdx_errh?: ErrorRoute }).__pdx_errh = boundaryHandler;
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
        for (let i = 0; i < deps.length; i++) deps[i].delete(run);
        deps = [];
    };
    // Register with the enclosing ownership scope so removed subtrees dispose
    // their effects (idempotent — safe even if also disposed explicitly).
    if (currentOwner) currentOwner.push(dispose);
    return dispose;
}

// --- Batch ---

/**
 * Group writes so subscribers run once, after all of them.
 *
 * Mostly unnecessary: synchronous writes are batched automatically, so this is for the cases the
 * automatic batching cannot see — writes spread across an `await`, or inside a callback the runtime
 * did not schedule. Wrapping ordinary code in it changes nothing.
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

// --- Internal: Notification + Flush ---

/**
 * Schedule a single subscriber.
 * Computeds are lazy: their `markDirty` marks the cached value stale and propagates the
 * dirtiness to ITS subscribers synchronously — it must NOT go through the effect queue.
 * Queuing it there would re-schedule effects that are already in the current flush, so an
 * effect reading both a signal and a signal-derived computed would run twice per set (and could
 * read a stale computed if it ran before the mark). Only effects (leaf subscribers) are
 * queued, each once; effects always recompute the computed lazily on read → glitch-free.
 */
function scheduleSubscriber(sub: Subscriber): void {
    if ((sub as { __pdx_mark?: boolean }).__pdx_mark) sub();
    else enqueuePending(sub);
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
        for (const sub of subscribers) scheduleSubscriber(sub);
    } else {
        batchDepth++;
        for (const sub of subscribers) scheduleSubscriber(sub);
        batchDepth--;
        flush();
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

        batchDepth++;
        for (let i = 0; i < len; i++) {
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
        batchDepth--;
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
