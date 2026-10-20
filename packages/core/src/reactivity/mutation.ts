// Reactive mutation primitive — execute, track state, invalidate cache, optimistic update.
//
// Security:
//   - A call made while another is pending follows the mutation's `concurrency` (#500): by default
//     it waits its turn, in call order (the double-submit guard is the button's: `<pdx-button :action>`)
//   - Optimistic values are overlays on the value the key had: a failing call removes its own, and
//     the others stay
//   - No credentials/tokens in error signals
//
// Performance:
//   - State signals are batch-updated (single flush)
//   - The base value is read only when an optimistic config is provided

import { signal, computed, batch } from './signal';
import type { ReadonlySignal } from '../utils/types';
import { getDefaultCache } from './cache';
import type { Cache, InvalidationMatcher } from './cache';
import { DEV } from '../utils/env';

// ─── Types ─────────────────────────────────────────────────────────

export type MutationState = 'idle' | 'pending' | 'success' | 'error';

/**
 * What a call made while another is pending does (#500). No policy aborts the running write.
 * - `'queue'`: runs after it, in call order; a rejection does not stop the next.
 * - `'drop'`: is ignored; `execute()` returns the pending call's promise.
 * - `'coalesce'`: replaces the call waiting behind the running one, never the running one; the
 *   replaced call's promise settles with the call that replaced it.
 * - `'parallel'`: runs at once; `data()` and `error()` are those of the last call to settle.
 */
export type MutationConcurrency = 'queue' | 'drop' | 'coalesce' | 'parallel';

/** The rejection of a call whose `enabled()` was false when its turn came: it did not run. */
export class ActionDisabledError extends Error {
    constructor() {
        super('The action is disabled: the call did not run.');
        this.name = 'ActionDisabledError';
    }
}

export interface MutationOptions<TData, TInput> {
    /** The async function to execute. `signal` is the call's own, aborted by `cancel()`. */
    fn: (input: TInput, context: { signal: AbortSignal }) => Promise<TData>;
    /** What a call made while another is pending does. Default `'queue'`. */
    concurrency?: MutationConcurrency;
    /** Whether a call may run: one whose turn comes while this is false rejects with `ActionDisabledError`. */
    enabled?: () => boolean;
    /** Called on success with the result and input. */
    onSuccess?: (data: TData, input: TInput) => void;
    /** Called on error with the error and input. */
    onError?: (error: unknown, input: TInput) => void;
    /** Called after success or error (always fires). */
    onSettled?: (data: TData | undefined, error: unknown | undefined, input: TInput) => void;
    /** Cache keys/tags to invalidate after successful mutation. */
    invalidate?: InvalidationMatcher;
    /** Optimistic update: applied when a call starts, rolled back if that call fails. */
    optimistic?: {
        /** Cache key to update optimistically. */
        key: string;
        /** Compute the optimistic cache value from current + input. */
        update: (current: unknown, input: TInput) => unknown;
    };
    /** Custom cache instance (default: global). */
    cache?: Cache;
}

export interface Mutation<TData, TInput> {
    /** Execute the mutation. A call made while another is pending follows `concurrency`. */
    execute(input: TInput): Promise<TData>;
    /** Abort the running call's signal and drop every waiting call: their promises reject with an `AbortError`, and none becomes `error()`. */
    cancel(): void;
    /** The policy for a call made while another is pending. */
    readonly concurrency: MutationConcurrency;
    /** Whether a call may run now (`true` without an `enabled` option). */
    readonly enabled: ReadonlySignal<boolean>;
    /** The result of the last call that settled, if it succeeded. */
    readonly data: ReadonlySignal<TData | undefined>;
    /** The error of the last call that failed; cleared only by the next success (null until then). */
    readonly error: ReadonlySignal<Error | null>;
    /** `pending` while any call is running or waiting; otherwise the outcome of the last one. */
    readonly state: ReadonlySignal<MutationState>;
    /** Whether any call is running or waiting. */
    readonly pending: ReadonlySignal<boolean>;
    /** Reset state to idle. */
    reset(): void;
}

/** One call: its input, its own abort signal, and the promise `execute` returned for it. */
interface Call<TData, TInput> {
    input: TInput;
    controller: AbortController;
    promise: Promise<TData>;
    resolve: (value: TData) => void;
    reject: (reason: unknown) => void;
}

/** The `AbortError` a cancelled call rejects with. */
const abortError = (): DOMException => new DOMException('The action was cancelled.', 'AbortError');

// ─── mutation() ────────────────────────────────────────────────────

/**
 * A write as reactive state: `execute(input)` plus the `pending`, `data` and `error` a form needs to
 * disable its submit button and show what happened.
 *
 * By default calls are queued, not run at once: `execute` while one is in flight waits for it, so two
 * writes of the same record never race, and an autosave and a save both land, in order. `concurrency`
 * chooses otherwise — drop, coalesce, or run in parallel. A user double-clicking Save must still not
 * create two records — that guard is the button's: `<pdx-button :action="save">` is busy and refuses
 * clicks while `pending()`, under the policies that wait.
 *
 * `invalidate` names the cache tags to drop on success, which is how a list refreshes itself after
 * an item is created without the caller wiring the two together.
 */
export function mutation<TData, TInput = void>(
    options: MutationOptions<TData, TInput>,
): Mutation<TData, TInput> {
    const cache = options.cache ?? getDefaultCache();
    const concurrency: MutationConcurrency = options.concurrency ?? 'queue';
    const isEnabled = (): boolean => (options.enabled ? options.enabled() : true);

    const _data = signal<TData | undefined>(undefined);
    const _error = signal<Error | null>(null);
    const _state = signal<MutationState>('idle');

    const running = new Set<Call<TData, TInput>>();
    const waiting: Call<TData, TInput>[] = [];
    /** The outcome of the last call that settled as a write, which `state()` shows once nothing is pending. */
    let lastOutcome: MutationState = 'idle';

    /** `pending` while a call runs or waits, else the last outcome. */
    function syncState(): void {
        _state.set(running.size > 0 || waiting.length > 0 ? 'pending' : lastOutcome);
    }

    // ── Optimistic overlays ──
    // The value the key had before the first running overlay, and each running call's overlay in the
    // order the calls started. A failing call's overlay is removed and the rest re-applied on the base.
    let base: { had: boolean; value: unknown } | null = null;
    const overlays: Call<TData, TInput>[] = [];

    /** The value the key shows: the base with each remaining overlay applied, in order. */
    function applyOverlays(): void {
        const opt = options.optimistic;
        if (!opt || !base) return;
        if (overlays.length === 0 && !base.had) { cache.remove(opt.key); return; }
        let value = base.value;
        for (const call of overlays) value = opt.update(value, call.input);
        cache.set(opt.key, value);
    }

    /** Apply `call`'s optimistic value as it starts. An `update` that throws applies nothing. */
    function addOverlay(call: Call<TData, TInput>): void {
        const opt = options.optimistic;
        if (!opt) return;
        const before = base;
        if (!base) {
            const entry = cache.get(opt.key);
            base = { had: entry !== undefined, value: entry?.data };
        }
        overlays.push(call);
        try {
            applyOverlays();
        } catch (err) {
            // The update threw: this call goes without an optimistic value, as it always has.
            overlays.pop();
            if (!before && overlays.length === 0) base = null;
            reportUpdateError(err);
        }
    }

    /** Remove `call`'s overlay; `failed` re-applies the rest on the base. Drops the base when none is left. */
    function settleOverlay(call: Call<TData, TInput>, failed: boolean): void {
        const i = overlays.indexOf(call);
        if (i >= 0 && failed) {
            overlays.splice(i, 1);
            applyOverlays();
        }
        if (running.size === 0) { base = null; overlays.length = 0; }
    }

    // ── Calls ──

    function newCall(input: TInput): Call<TData, TInput> {
        let resolve!: (value: TData) => void;
        let reject!: (reason: unknown) => void;
        const promise = new Promise<TData>((res, rej) => { resolve = res; reject = rej; });
        return { input, controller: new AbortController(), promise, resolve, reject };
    }

    function execute(input: TInput): Promise<TData> {
        const busy = running.size > 0 || waiting.length > 0;
        if (busy && concurrency === 'drop') {
            const pending = running.values().next().value ?? waiting[0];
            return pending.promise;
        }
        const call = newCall(input);
        if (!busy || concurrency === 'parallel') {
            start(call);
        } else if (concurrency === 'coalesce' && waiting.length > 0) {
            // The waiting call is replaced, and settles with the call that replaced it.
            const replaced = waiting.splice(0, waiting.length);
            for (const r of replaced) call.promise.then(r.resolve, r.reject);
            waiting.push(call);
        } else {
            waiting.push(call);
        }
        batch(syncState);
        return call.promise;
    }

    /** Start `call`, unless `enabled()` is false: then it rejects with `ActionDisabledError` and the next takes its turn. */
    function start(call: Call<TData, TInput>): void {
        if (!isEnabled()) {
            call.reject(new ActionDisabledError());
            next();
            return;
        }
        running.add(call);
        addOverlay(call);
        let result: Promise<TData>;
        try {
            result = Promise.resolve(options.fn(call.input, { signal: call.controller.signal }));
        } catch (err) {
            result = Promise.reject(err);
        }
        result.then((data) => succeed(call, data), (err) => fail(call, err));
    }

    /** The next waiting call, when nothing runs. */
    function next(): void {
        if (running.size > 0) return;
        const call = waiting.shift();
        if (call) start(call);
        batch(syncState);
    }

    function succeed(call: Call<TData, TInput>, data: TData): void {
        running.delete(call);
        settleOverlay(call, false);
        lastOutcome = 'success';
        batch(() => {
            _data.set(data);
            _error.set(null);
            syncState();
        });
        if (options.invalidate) cache.invalidate(options.invalidate);
        options.onSuccess?.(data, call.input);
        options.onSettled?.(data, undefined, call.input);
        call.resolve(data);
        next();
    }

    function fail(call: Call<TData, TInput>, err: unknown): void {
        running.delete(call);
        settleOverlay(call, true);
        // A cancelled call is not an error of the write: `error()` and the outcome stay as they were.
        const cancelled = call.controller.signal.aborted;
        if (!cancelled) lastOutcome = 'error';
        batch(() => {
            if (!cancelled) _error.set(err as Error);
            syncState();
        });
        if (!cancelled) {
            options.onError?.(err, call.input);
            options.onSettled?.(undefined, err, call.input);
        }
        call.reject(cancelled ? abortError() : err);
        next();
    }

    function cancel(): void {
        const dropped = waiting.splice(0, waiting.length);
        for (const call of running) call.controller.abort(abortError());
        for (const call of dropped) call.reject(abortError());
        batch(syncState);
    }

    return {
        execute,
        cancel,
        concurrency,
        enabled: computed(isEnabled) as ReadonlySignal<boolean>,
        data: computed(() => _data()) as ReadonlySignal<TData | undefined>,
        error: computed(() => _error()) as ReadonlySignal<Error | null>,
        state: computed(() => _state()) as ReadonlySignal<MutationState>,
        pending: computed(() => _state() === 'pending') as ReadonlySignal<boolean>,
        reset(): void {
            lastOutcome = 'idle';
            batch(() => {
                _data.set(undefined);
                _error.set(null);
                syncState();
            });
        },
    };
}

/** An optimistic `update` that threw: the call runs without one, and the throw is said in development. */
function reportUpdateError(err: unknown): void {
    if (DEV) console.warn('[pdx] mutation: the optimistic update threw, so the call runs without one.', err);
}
