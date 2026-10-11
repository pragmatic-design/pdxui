// Loaders, one per level of the matched chain.

import { _loaderData, _loaderState, _loaderFocus, type LoaderState } from './state';
import type { RouteConfig } from './types';

/**
 * The params each level's loader last ran with — ITS OWN, not the whole match.
 *
 * This is what makes a sibling move cheap: `/tickets/7/notes/1` → `/tickets/7/notes/2` leaves the
 * ticket's own `:id` untouched, so its loader does not run again and the page it feeds does not
 * flicker. Change `:id` and it does.
 */
let _loaderKeys: Record<string, string> = {};

/** The params a level declares in its OWN pattern. `/tickets/:id/notes/:n` at the parent → ['id']. */
function ownParamNames(pattern: string): string[] {
    return [...pattern.matchAll(/:([A-Za-z0-9_]+)/g)].map(m => m[1]);
}

/** A level's identity for this navigation: its own params, with their values. */
function loaderKey(pattern: string, params: Record<string, string>): string {
    return ownParamNames(pattern).map(n => `${n}=${params[n] ?? ''}`).join('&');
}

/**
 * Decide what has to load, and commit what does not — synchronously.
 *
 * Split from the running on purpose. `handleNavigation` must stay SYNCHRONOUS for a navigation
 * with nothing to load: awaiting unconditionally makes every navigation asynchronous, and then a
 * navigation that started earlier finishes later and publishes its route over a newer one — the
 * initial navigation to `/` lands on top of a 404 that has already been reported. The same holds
 * for `await`ing a boolean before-hook.
 *
 * Returns the levels that still have to run, outermost first. Empty means nothing to await.
 */
export function planLoaders(
    chain: RouteConfig[],
    params: Record<string, string>,
): RouteConfig[] {
    const prevData = _loaderData.peek();
    const prevState = _loaderState.peek();
    const prevKeys = _loaderKeys;

    // Built from the CHAIN, so a level that is not in it is simply not carried over: leaving
    // a branch forgets its data rather than leaving it readable from somewhere it does not belong.
    const data: Record<string, unknown> = {};
    const state: Record<string, LoaderState> = {};
    const keys: Record<string, string> = {};

    const pending: RouteConfig[] = [];

    for (const level of chain) {
        const key = loaderKey(level.path, params);
        keys[level.path] = key;
        if (!level.loader) continue;

        // Unchanged since the last navigation: keep it. This is the sibling move — the parent's
        // data stays on screen and no request is made for something already held.
        if (prevKeys[level.path] === key && level.path in prevData) {
            data[level.path] = prevData[level.path];
            state[level.path] = prevState[level.path] ?? 'done';
            continue;
        }
        state[level.path] = 'loading';
        pending.push(level);
    }

    _loaderData.set(data);
    _loaderState.set(state);
    _loaderKeys = keys;
    return pending;
}

/**
 * Run the planned loaders in order, outermost first — the order the data depends in, and the order
 * the guards already run in. Returns false when a newer navigation superseded this one, which
 * `isCurrent` answers.
 */
export async function runLoaders(pending: RouteConfig[], isCurrent: () => boolean): Promise<boolean> {
    for (const level of pending) {
        if (!level.loader) continue;
        try {
            const result = await level.loader();
            if (!isCurrent()) return false; // a newer navigation won — drop this stale result
            _loaderData.set({ ..._loaderData.peek(), [level.path]: result });
            _loaderState.set({ ..._loaderState.peek(), [level.path]: 'done' });
        } catch (err) {
            if (!isCurrent()) return false;
            const nextData = { ..._loaderData.peek() };
            delete nextData[level.path];
            _loaderData.set(nextData);
            _loaderState.set({ ..._loaderState.peek(), [level.path]: 'error' });
            console.error(`[pdx-router] Loader failed for ${level.path}:`, err);
        }
    }
    // Checked on the way out even when nothing ran. This function is async whatever the chain
    // holds, so every navigation yields a microtask here — and a navigation that started BEFORE a
    // newer one would otherwise resume and publish its route over it: the initial navigation to
    // `/` would overwrite a 404 that had already been reported.
    return isCurrent();
}

/** Nothing matched, or a guard denied: no level has data any more. */
export function clearLoaders(): void {
    _loaderData.set({});
    _loaderState.set({});
    _loaderKeys = {};
    _loaderFocus.set(null);
}
