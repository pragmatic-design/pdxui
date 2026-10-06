// Reactive mutation primitive — execute, track state, invalidate cache, optimistic update.
//
// Security:
//   - Double-submit guard: execute() is no-op while pending
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
    /** Execute the mutation. Rejects on error — and with Error('Mutation already in progress')
     *  when called while an execution is already pending (a guard against double submits). */
    execute(input: TInput): Promise<TData>;
    /** Last successful result. */
    readonly data: ReadonlySignal<TData | undefined>;
    /** Last error. */
    readonly error: ReadonlySignal<unknown | undefined>;
    /** Current state. */
    readonly state: ReadonlySignal<MutationState>;
    /** Whether mutation is in progress. */
    readonly pending: ReadonlySignal<boolean>;
    /** Reset state to idle. */
    reset(): void;
}

// ─── mutation() ────────────────────────────────────────────────────

/**
 * A write as reactive state: `execute(input)` plus the `pending`, `data` and `error` a form needs to
 * disable its submit button and show what happened.
 *
 * Concurrent executions are refused, not queued: calling `execute` while one is in flight rejects
 * with "Mutation already in progress". That is the double-submit guard — a user double-clicking
 * Save must not create two records — and it is why this is not just an async function.
 *
 * `invalidates` names the cache tags to drop on success, which is how a list refreshes itself after
 * an item is created without the caller wiring the two together.
 */
export function mutation<TData, TInput = void>(
    options: MutationOptions<TData, TInput>,
): Mutation<TData, TInput> {
    const cache = options.cache ?? getDefaultCache();

    const _data = signal<TData | undefined>(undefined);
    const _error = signal<unknown | undefined>(undefined);
    const _state = signal<MutationState>('idle');

    // Double-submit guard
    let isPending = false;

    async function execute(input: TInput): Promise<TData> {
        // Guard: prevent concurrent executions
        if (isPending) {
            throw new Error('Mutation already in progress');
        }

        isPending = true;
        let snapshot: unknown = undefined;
        let hasSnapshot = false;

        batch(() => {
            _state.set('pending');
            _error.set(undefined);
        });

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
                _error.set(undefined);
                _state.set('success');
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
                _error.set(err);
                _state.set('error');
            });

            options.onError?.(err, input);
            options.onSettled?.(undefined, err, input);

            throw err;
        } finally {
            isPending = false;
        }
    }

    return {
        execute,
        data: computed(() => _data()) as ReadonlySignal<TData | undefined>,
        error: computed(() => _error()) as ReadonlySignal<unknown | undefined>,
        state: computed(() => _state()) as ReadonlySignal<MutationState>,
        pending: computed(() => _state() === 'pending') as ReadonlySignal<boolean>,
        reset(): void {
            isPending = false;
            batch(() => {
                _data.set(undefined);
                _error.set(undefined);
                _state.set('idle');
            });
        },
    };
}
