// Reactive mutation primitive — execute, track state, invalidate cache, optimistic update.
//
// Security:
//   - Calls are serialised: one runs at a time, the others wait in call order (the double-submit
//     guard is the button's: `<pdx-button :action>`)
//   - Optimistic rollback: snapshot restored atomically on error
//   - No credentials/tokens in error signals
//
// Performance:
//   - State signals are batch-updated (single flush)
//   - Snapshot is taken only when optimistic config is provided

import { signal, computed, batch } from './signal';
import type { ReadonlySignal } from '../utils/types';
import { getDefaultCache } from './cache';
import type { Cache, InvalidationMatcher } from './cache';

// ─── Types ─────────────────────────────────────────────────────────

export type MutationState = 'idle' | 'pending' | 'success' | 'error';

export interface MutationOptions<TData, TInput> {
    /** The async function to execute. */
    fn: (input: TInput) => Promise<TData>;
    /** Called on success with the result and input. */
    onSuccess?: (data: TData, input: TInput) => void;
    /** Called on error with the error and input. */
    onError?: (error: unknown, input: TInput) => void;
    /** Called after success or error (always fires). */
    onSettled?: (data: TData | undefined, error: unknown | undefined, input: TInput) => void;
    /** Cache keys/tags to invalidate after successful mutation. */
    invalidate?: InvalidationMatcher;
    /** Optimistic update: apply to cache immediately, rollback on error. */
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
    /** Execute the mutation. A call made while another is pending waits its turn: calls run one at
     *  a time, in call order, and each promise resolves or rejects with its own result. */
    execute(input: TInput): Promise<TData>;
    /** The result of the last call that finished, if it succeeded. */
    readonly data: ReadonlySignal<TData | undefined>;
    /** The error of the last call that failed; cleared only by the next success (null until then). */
    readonly error: ReadonlySignal<Error | null>;
    /** `pending` while any call is running or queued; otherwise the outcome of the last one. */
    readonly state: ReadonlySignal<MutationState>;
    /** Whether any call is running or queued. */
    readonly pending: ReadonlySignal<boolean>;
    /** Reset state to idle. */
    reset(): void;
}

// ─── mutation() ────────────────────────────────────────────────────

/**
 * A write as reactive state: `execute(input)` plus the `pending`, `data` and `error` a form needs to
 * disable its submit button and show what happened.
 *
 * Calls are queued, not run at once: `execute` while one is in flight waits for it, so two writes
 * of the same record never race, and an autosave and a save both land, in order. A user
 * double-clicking Save must still not create two records — that guard is the button's:
 * `<pdx-button :action="save">` is busy and refuses clicks while `pending()`.
 *
 * `invalidate` names the cache tags to drop on success, which is how a list refreshes itself after
 * an item is created without the caller wiring the two together.
 */
export function mutation<TData, TInput = void>(
    options: MutationOptions<TData, TInput>,
): Mutation<TData, TInput> {
    const cache = options.cache ?? getDefaultCache();

    const _data = signal<TData | undefined>(undefined);
    const _error = signal<Error | null>(null);
    const _state = signal<MutationState>('idle');

    // The queue: calls made and not yet settled, and the settlement of the last one, which the next
    // call waits for. Settled either way — a rejected call must not stop the ones behind it.
    let outstanding = 0;
    let tail: Promise<void> = Promise.resolve();

    function execute(input: TInput): Promise<TData> {
        outstanding++;
        // Nothing in flight: start now, as a call always has — the optimistic value is in the cache
        // and `fn` has been called before `execute` returns. Otherwise wait for the call before.
        let run: Promise<TData>;
        if (outstanding === 1) {
            _state.set('pending');
            run = runOne(input);
        } else {
            run = tail.then(() => runOne(input));
        }
        tail = run.then(settled, settled);
        return run;
    }

    /** One call off the queue has settled, whatever its outcome (the caller's promise carries it). */
    function settled(): void {
        outstanding--;
    }

    /** What the last call to finish leaves in `state()`: still `pending` while others are queued. */
    const finalState = (outcome: MutationState): MutationState => (outstanding > 1 ? 'pending' : outcome);

    async function runOne(input: TInput): Promise<TData> {
        let snapshot: unknown = undefined;
        let hasSnapshot = false;

        // Optimistic update: snapshot current cache value, apply optimistic
        let hadEntry = false;
        if (options.optimistic) {
            const entry = cache.get(options.optimistic.key);
            hadEntry = entry !== undefined;
            snapshot = entry?.data;
            hasSnapshot = true;
            try {
                const optimisticValue = options.optimistic.update(snapshot, input);
                cache.set(options.optimistic.key, optimisticValue);
            } catch {
                // Optimistic update function threw — skip optimistic, proceed normally
                hasSnapshot = false;
            }
        }

        try {
            const result = await options.fn(input);

            batch(() => {
                _data.set(result);
                _error.set(null);
                _state.set(finalState('success'));
            });

            // Invalidate cache after success
            if (options.invalidate) {
                cache.invalidate(options.invalidate);
            }

            options.onSuccess?.(result, input);
            options.onSettled?.(result, undefined, input);

            return result;
        } catch (err) {
            // Rollback optimistic update. If the key had no entry before, remove it rather
            // than writing `undefined` — otherwise we'd materialize a fresh cache entry with
            // data:undefined that a later resource would treat as a valid hit.
            if (hasSnapshot && options.optimistic) {
                if (hadEntry) cache.set(options.optimistic.key, snapshot);
                else cache.remove(options.optimistic.key);
            }

            batch(() => {
                _error.set(err as Error);
                _state.set(finalState('error'));
            });

            options.onError?.(err, input);
            options.onSettled?.(undefined, err, input);

            throw err;
        }
    }

    return {
        execute,
        data: computed(() => _data()) as ReadonlySignal<TData | undefined>,
        error: computed(() => _error()) as ReadonlySignal<Error | null>,
        state: computed(() => _state()) as ReadonlySignal<MutationState>,
        pending: computed(() => _state() === 'pending') as ReadonlySignal<boolean>,
        reset(): void {
            batch(() => {
                _data.set(undefined);
                _error.set(null);
                _state.set('idle');
            });
        },
    };
}
