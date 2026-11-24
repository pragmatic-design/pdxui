// pdx-error-boundary's context: what the nearest boundary provides to the components inside it.
// Beside the component, which re-exports it from its entry (#1352): `@pdxui/ui/error-boundary` gives
// `ErrorContext` as before its move to .pdx (#1210).
import { context } from '@pdxui/core';
import type { Signal, ReadonlySignal } from '@pdxui/core';

/** Error context provided to descendants via hierarchical provide. */
export interface ErrorContext {
    /** Current error (null if no error). */
    error: Signal<Error | null>;
    /** Number of retries attempted. */
    retryCount: Signal<number>;
    /** Whether a retry is possible. */
    canRetry: ReadonlySignal<boolean>;
    /** Trigger a retry. */
    retry: () => void;
}

/**
 * The context token the nearest boundary provides its `ErrorContext` under (#495): a component inside
 * reads it with `inject(ErrorContext, el, null)`.
 */
export const ErrorContext = context<ErrorContext>('error-boundary');
