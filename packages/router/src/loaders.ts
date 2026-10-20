// Loaders, one per level of the matched chain, each beside its level's chunk (#119).

// Every write of a level's data, state and error below is one `batch` (#569): written one by one, each
// notified on its own, and a reader saw the level half-way — its data dropped while its state still
// said 'success', which `@await` takes for a loader that returned undefined.
import { batch, queuePrefetch, takePrefetch } from '@pdxui/core';
import { _loaderData, _loaderState, _loaderError, _loaderStale, _loaderFocus, type LoaderState } from './state';
import { pageModule } from './route-table';
import { loaderIdentity, parseLoaderQuery, takePrefetchedLoaderCall } from './loader-prefetch';
import { coerceParams } from './matcher';
import { outcomeOf } from './outcomes';
import { keptResult, keepResult, watchKept } from './loader-cache';
import type { LoaderContext, RouteConfig } from './types';

/**
 * The controller of the navigation in progress (#505): its signal is every loader's `ctx.signal`.
 * A newer navigation aborts it as it starts — which is when `isCurrent()` turns false — and so does
 * `clearLoaders()`.
 */
let _navController: AbortController | null = null;

/** A navigation starts: the previous one's loaders are told they are superseded. Returns the new signal. */
export function supersedeLoaders(): AbortSignal {
    _navController?.abort();
    _navController = new AbortController();
    _generation++;
    return _navController.signal;
}

/** The signal of the navigation in progress, or one that is never aborted when none has started. */
function currentSignal(): AbortSignal {
    return (_navController ??= new AbortController()).signal;
}

/** A rejection as an Error: what `loaderError(path)` holds. */
const asError = (reason: unknown): Error => (reason instanceof Error ? reason : new Error(String(reason)));

/**
 * The identity each level's loader last ran with: `pattern | own params | canonical query`, the key
 * `docs/language/beta/routing.md` defines in «The identity of a loader call».
 *
 * This is what makes a sibling move cheap: `/tickets/7/notes/1` → `/tickets/7/notes/2` leaves the
 * ticket's own `:id` untouched, so its loader does not run again and the page it feeds does not
 * flicker. Change `:id`, or the query, and it does.
 */
let _loaderKeys: Record<string, string> = {};

/** What a navigation's loaders have to do: run before the page is shown, or again behind a kept result. */
export interface LoaderPlan {
    /** No result to show: run, outermost first, and the navigation waits for them. */
    pending: RouteConfig[];
    /** A kept result is shown, `stale()`, while the loader runs again — the navigation does not wait. */
    revalidate: RouteConfig[];
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
 * Each level, outermost first (#148):
 *   - mounted, with its key unchanged: kept, whatever its `staleTime` — `staleTime` governs a level
 *     that is entered again, not one that never left;
 *   - a kept result younger than its `staleTime`: taken, the loader is not run;
 *   - an older one: shown with `stale()` true, the loader runs again behind it (`revalidate`);
 *   - none: the loader runs before the page is shown (`pending`).
 */
export function planLoaders(
    chain: RouteConfig[],
    params: Record<string, string>,
    search = '',
): LoaderPlan {
    const prevData = _loaderData.peek();
    const prevState = _loaderState.peek();
    const prevErrors = _loaderError.peek();
    const prevStale = _loaderStale.peek();
    const prevKeys = _loaderKeys;

    // Built from the CHAIN, so a level that is not in it is simply not carried over: leaving
    // a branch forgets its data rather than leaving it readable from somewhere it does not belong.
    const data: Record<string, unknown> = {};
    const state: Record<string, LoaderState> = {};
    const errors: Record<string, Error> = {};
    const stale: Record<string, boolean> = {};
    const keys: Record<string, string> = {};

    const plan: LoaderPlan = { pending: [], revalidate: [] };

    for (const level of chain) {
        const key = loaderIdentity(level.path, params, search);
        keys[level.path] = key;
        if (!level.loader) continue;
        // A level's last failure stays readable until it succeeds again (#505).
        if (level.path in prevErrors) errors[level.path] = prevErrors[level.path];

        // Unchanged since the last navigation: keep it. This is the sibling move — the parent's
        // data stays on screen and no request is made for something already held.
        if (prevKeys[level.path] === key && level.path in prevData) {
            data[level.path] = prevData[level.path];
            state[level.path] = prevState[level.path] ?? 'success';
            if (prevStale[level.path]) stale[level.path] = true;
            continue;
        }
        const kept = keptResult(key);
        if (kept?.fresh) {
            data[level.path] = kept.data;
            state[level.path] = 'success';
            continue;
        }
        state[level.path] = 'pending';
        if (kept) {
            data[level.path] = kept.data;
            stale[level.path] = true;
            plan.revalidate.push(level);
        } else {
            plan.pending.push(level);
        }
    }

    batch(() => {
        _loaderData.set(data);
        _loaderState.set(state);
        _loaderError.set(errors);
        _loaderStale.set(stale);
    });
    _loaderKeys = keys;
    return plan;
}

/**
 * Start the chunk of every level of the chain, all at once, and return them by level path.
 *
 * Chunks do not depend on each other, so none waits for another, nor for a loader. Each goes through
 * core's load queue under the level's pattern, as a prefetch would (`takePrefetch`): the outlet then
 * takes this same load when it renders the level and awaits it, rather than calling `import()` a
 * second time — a second call does not wait for the stylesheet the first one is fetching, and the
 * page would paint unstyled. A level with no chunk of its own (in the entry, or no table) has none.
 */
export function startChunks(chain: RouteConfig[]): Map<string, Promise<unknown>> {
    const chunks = new Map<string, Promise<unknown>>();
    for (const level of chain) {
        let load = takePrefetch(level.path);
        if (!load) {
            const importPage = pageModule(level.path);
            if (importPage && queuePrefetch(level.path, importPage)) load = takePrefetch(level.path);
        }
        if (load) chunks.set(level.path, load);
    }
    return chunks;
}

/**
 * Run the planned loaders in order, outermost first — the order the data depends in, and the order
 * the guards already run in. Each level settles when its loader AND its chunk have: the chunk is
 * already on its way (`startChunks`), and a failure of the chunk is the outlet's to report, not the
 * loader's. A call a prefetch started for the same identity is taken instead of calling the loader,
 * with its controller: this navigation's supersede aborts it too.
 *
 * Each loader receives its level's context (#505): the params coerced by the level's constraints,
 * the parsed query, and the navigation's signal. A failure is kept in `loaderError(path)`.
 *
 * The first loader that throws ends the run with its outcome (#147): `redirect(to)` sends the
 * navigation on, `notFound()` and any other error stop it at that level — the levels below it would
 * render under a parent that has nothing to show, so they are not run.
 */
export async function runLoaders(
    pending: RouteConfig[], isCurrent: () => boolean,
    { chunks, params = {}, search = '' }: { chunks?: Map<string, Promise<unknown>>; params?: Record<string, string>; search?: string } = {},
): Promise<LoaderOutcome> {
    const signal = currentSignal();
    for (const level of pending) {
        if (!level.loader) continue;
        try {
            const [data] = await Promise.allSettled([callLoader(level, params, search, signal), chunks?.get(level.path)]);
            if (data.status === 'rejected') throw data.reason;
            const result = data.value;
            if (!isCurrent()) return { kind: 'superseded' }; // a newer navigation won — drop this stale result
            publishResult(level, loaderIdentity(level.path, params, search), result);
        } catch (err) {
            if (!isCurrent()) return { kind: 'superseded' };
            // A redirect is not a failure of this level: it is where the navigation goes instead.
            const outcome = outcomeOf(err);
            if (outcome?.pdxOutcome === 'redirect') return { kind: 'redirect', to: outcome.to, replace: outcome.replace };
            const nextData = { ..._loaderData.peek() };
            delete nextData[level.path];
            batch(() => {
                _loaderData.set(nextData);
                _loaderState.set({ ..._loaderState.peek(), [level.path]: 'error' });
                _loaderError.set({ ..._loaderError.peek(), [level.path]: asError(err) });
            });
            if (outcome?.pdxOutcome === 'notFound') return { kind: 'notFound', level };
            console.error(`[pdx-router] Loader failed for ${level.path}:`, err);
            return { kind: 'error', level };
        }
    }
    // Checked on the way out even when nothing ran. This function is async whatever the chain
    // holds, so every navigation yields a microtask here — and a navigation that started BEFORE a
    // newer one would otherwise resume and publish its route over it: the initial navigation to
    // `/` would overwrite a 404 that had already been reported.
    return isCurrent() ? { kind: 'loaded' } : { kind: 'superseded' };
}

/**
 * Call a level's loader with its context (#505), or take the call a prefetch started for the same
 * identity — with its controller, which this navigation's supersede aborts too.
 */
function callLoader(level: RouteConfig, params: Record<string, string>, search: string, signal: AbortSignal): unknown {
    const prefetched = takePrefetchedLoaderCall(loaderIdentity(level.path, params, search));
    if (prefetched) signal.addEventListener('abort', () => prefetched.controller.abort(), { once: true });
    if (prefetched) return prefetched.promise;
    const ctx: LoaderContext = { params: coerceParams(level.path, params), query: parseLoaderQuery(search), signal };
    return level.loader!(ctx);
}

/** A level's new result: published as one write (#569), no longer stale, and kept in the cache (#148). */
function publishResult(level: RouteConfig, identity: string, result: unknown): void {
    const errors = { ..._loaderError.peek() };
    delete errors[level.path];
    const stale = { ..._loaderStale.peek() };
    delete stale[level.path];
    batch(() => {
        _loaderData.set({ ..._loaderData.peek(), [level.path]: result });
        _loaderState.set({ ..._loaderState.peek(), [level.path]: 'success' });
        _loaderError.set(errors);
        _loaderStale.set(stale);
    });
    keepResult(level, identity, result);
}

/**
 * Bumped when a navigation starts or the loaders are cleared: a run behind a kept result belongs to
 * the generation it started in, and publishes nothing once that has passed.
 */
let _generation = 0;

/**
 * Run `levels` again behind the kept result each is showing, `stale()` (#148), without the navigation
 * waiting for them. Outermost first, as a navigation's loaders run. A new result replaces the kept
 * one; a failure keeps it on screen and says so in `state()` and `error()` (the async vocabulary's
 * refresh that failed, data.md); a `redirect()` sends the visitor there, as from a navigation's
 * loader. `notFound()` from a level whose result is on screen is a failure like any other.
 */
export async function revalidateLoaders(
    levels: RouteConfig[], params: Record<string, string>, search: string,
    redirectTo: (to: string, replace: boolean) => void,
): Promise<void> {
    const generation = _generation;
    const signal = currentSignal();
    for (const level of levels) {
        if (!level.loader) continue;
        const identity = loaderIdentity(level.path, params, search);
        try {
            const result = await callLoader(level, params, search, signal);
            if (generation !== _generation) return;
            publishResult(level, identity, result);
        } catch (err) {
            if (generation !== _generation) return;
            const outcome = outcomeOf(err);
            if (outcome?.pdxOutcome === 'redirect') { redirectTo(outcome.to, outcome.replace); return; }
            batch(() => {
                _loaderState.set({ ..._loaderState.peek(), [level.path]: 'error' });
                _loaderError.set({ ..._loaderError.peek(), [level.path]: asError(err) });
            });
            console.error(`[pdx-router] Loader failed for ${level.path}:`, err);
        }
    }
}

/** What watches the mounted levels' kept results, disposed at the next navigation. */
let _watchDispose: (() => void) | null = null;

/**
 * Watch the kept result of every loader level on screen (#148): when `invalidate(['loader:<pattern>'])`
 * — an `@action`'s `invalidate`, or any call — drops it, the level runs again at once, its result
 * still shown and `stale()` true meanwhile.
 */
export function watchMountedLoaders(
    chain: RouteConfig[], params: Record<string, string>, search: string,
    redirectTo: (to: string, replace: boolean) => void,
): void {
    _watchDispose?.();
    _watchDispose = null;
    const levels = chain.filter((level) => level.loader);
    if (levels.length === 0) return;
    const disposers = levels.map((level) => watchKept(loaderIdentity(level.path, params, search), () => {
        if (!(level.path in _loaderData.peek())) return;
        batch(() => {
            _loaderState.set({ ..._loaderState.peek(), [level.path]: 'pending' });
            _loaderStale.set({ ..._loaderStale.peek(), [level.path]: true });
        });
        void revalidateLoaders([level], params, search, redirectTo);
    }));
    _watchDispose = () => { for (const dispose of disposers) dispose(); };
}

/**
 * How the loaders of a navigation ended: all of them loaded; a newer navigation superseded this one;
 * a loader redirected; or a loader reported not found, or failed, at `level`.
 */
export type LoaderOutcome =
    | { kind: 'loaded' }
    | { kind: 'superseded' }
    | { kind: 'redirect'; to: string; replace: boolean }
    | { kind: 'notFound' | 'error'; level: RouteConfig };

/** Nothing matched, or a guard denied: no level has data any more. */
export function clearLoaders(): void {
    // A loader still running has nothing left to publish to: it is told.
    _navController?.abort();
    _navController = null;
    _generation++;
    _watchDispose?.();
    _watchDispose = null;
    batch(() => {
        _loaderData.set({});
        _loaderState.set({});
        _loaderError.set({});
        _loaderStale.set({});
        _loaderFocus.set(null);
    });
    _loaderKeys = {};
}
