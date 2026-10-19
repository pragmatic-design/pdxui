// A framework timer that pauses with its scope (#269; beta spec, lifecycle.md → «The matrix»: framework
// timers suspended with their remaining time kept). `@await`'s minMs/maxMs and `@defer`'s timer(n)
// use it: a page frozen 300 ms into an `@await { maxMs: 1000 }` times out 700 ms after it resumes.

import { onScopeSuspension, isScopeSuspended } from './signal';
import type { OwnerScope } from './signal';

/**
 * `setTimeout(fn, ms)`, paused while `scope` is suspended and resumed with the time it had left.
 * Without a scope it is a plain timeout. Returns what clears it.
 */
export function pausableTimeout(scope: OwnerScope | null, fn: () => void, ms: number): () => void {
    if (!scope) {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
    }
    let left = ms;
    let startedAt = 0;
    let id: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const start = (): void => {
        startedAt = Date.now();
        id = setTimeout(() => { done = true; removeHook(); fn(); }, left);
    };
    const removeHook = onScopeSuspension(
        scope,
        () => {
            if (id === undefined) return;
            clearTimeout(id);
            id = undefined;
            left = Math.max(0, left - (Date.now() - startedAt));
        },
        () => { if (!done && id === undefined) start(); },
    );
    // Registered under a suspended scope, the hook has already paused it: it starts on resume.
    if (!isScopeSuspended(scope)) start();
    return () => {
        done = true;
        if (id !== undefined) clearTimeout(id);
        id = undefined;
        removeHook();
    };
}
