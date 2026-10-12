// What the router publishes: the signals behind `currentPath()`, `currentRoute()` and the rest.
//
// Written only by the navigation (`navigation.ts`), the query writers (`address.ts`) and the
// loaders (`loaders.ts`); read by everybody through the computed views exported here.

import { signal, computed } from '@pdxui/core';
import type { ReadonlySignal } from '@pdxui/core';
import type { ResolvedRoute } from './types';

export const isBrowser = typeof window !== 'undefined';

export const _path = signal(isBrowser ? location.pathname : '/');
export const _params = signal<Record<string, string>>({});
export const _query = signal<Record<string, string>>({});
export const _search = signal(isBrowser ? location.search : '');
export const _meta = signal<Record<string, unknown> | undefined>(undefined);
export const _state = signal<Record<string, unknown> | undefined>(undefined);
// A loader's result per LEVEL, keyed by route pattern.
//
// Not one signal: with a parent and a child both loading, `currentLoaderData()` would have no
// answer — whose data is it? Running both into one value would give a page the other level's data
// depending on the order, which is worse than not running it.
//
// So the map, and two ways to read it: `currentLoaderData()` means "the matched route's", which is
// what a caller on a flat route wants, and
// `loaderData('/tickets/:id')` reads a named level — the case a parent/child split exists for. It
// is the shape React Router settled on (`useLoaderData` / `useRouteLoaderData`), for the same
// reason.
export type LoaderState = 'idle' | 'loading' | 'done' | 'error';
export const _loaderData = signal<Record<string, unknown>>({});
export const _loaderState = signal<Record<string, LoaderState>>({});
/** Which level `currentLoaderData()` resolves against: the matched route, set before its loader runs. */
export const _loaderFocus = signal<string | null>(null);
export const _route = signal<ResolvedRoute | null>(null);
// Distinguish a guard denial (403) from a no-match (404): both set _route to null,
// but the outlet needs to know WHICH error page to render.
export const _navError = signal<'403' | '404' | null>(null);
/**
 * The level of the chain the last 403 was raised at — 0 for a flat route or a denial at the top.
 *
 * A denial takes down the level it happened at and everything below it, and NOT the levels above:
 * those were allowed, and a permission on one tab must not cost the page the tab belongs to.
 * The outlet at this depth renders the refusal; the ones above it render their route.
 */
export const _navErrorDepth = signal(0);
/** The target of the navigation in progress — set once the before-hooks accept, null when none is. */
export const _navTarget = signal<string | null>(null);

export const currentPath: ReadonlySignal<string> = computed(() => _path());
export const currentParams: ReadonlySignal<Record<string, string>> = computed(() => _params());
export const currentQuery: ReadonlySignal<Record<string, string>> = computed(() => _query());
/** Raw query string of the current route, including the leading '?' (or '' when none). */
export const currentSearch: ReadonlySignal<string> = computed(() => _search());
export const currentMeta: ReadonlySignal<Record<string, unknown> | undefined> = computed(() => _meta());
/** Navigation state — ephemeral data passed via navigate(), not in the URL. */
export const currentState: ReadonlySignal<Record<string, unknown> | undefined> = computed(() => _state());
/** Data returned by the MATCHED route's @loader function. For a parent's, see {@link loaderData}. */
export const currentLoaderData: ReadonlySignal<unknown> = computed(() => {
    const focus = _loaderFocus();
    return focus === null ? undefined : _loaderData()[focus];
});
/** Loader execution state of the matched route: idle → loading → done/error. */
export const currentLoaderState: ReadonlySignal<LoaderState> = computed(() => {
    const focus = _loaderFocus();
    return focus === null ? 'idle' : (_loaderState()[focus] ?? 'idle');
});

/**
 * What a specific level's @loader returned, by its route pattern — `loaderData('/tickets/:id')`.
 *
 * This is how a child reads its parent's data: the parent loaded the ticket, the child loads one
 * intervention, and moving between interventions leaves the ticket alone. Reactive: read it in a
 * computed or a template and it updates when that level reloads.
 *
 * `undefined` when the level declared no loader, has not loaded yet, failed, or is not in the
 * current chain at all — a page cannot read the data of a branch it has left.
 */
export function loaderData(routePath: string): unknown {
    return _loaderData()[routePath];
}

/** The same, for the state. 'idle' for a level that is not loading and has nothing. */
export function loaderState(routePath: string): LoaderState {
    return _loaderState()[routePath] ?? 'idle';
}
export const currentRoute: ReadonlySignal<ResolvedRoute | null> = computed(() => _route());
/**
 * Last navigation error kind: '403' (guard denied, no redirect), '404' (no match),
 * or null (last navigation resolved a route). The outlet reads this to pick which
 * error page to render when currentRoute() is null.
 */
export const currentNavError: ReadonlySignal<'403' | '404' | null> = computed(() => _navError());

/**
 * The nesting depth that the current navigation error belongs to.
 *
 * The outlet compares it with its own depth: the one that matches renders the error page, the ones
 * above it keep their level of the chain. 0 for a 404 and for a denial with no allowed prefix,
 * which is the whole-page behaviour of a flat route.
 */
export const currentNavErrorDepth: ReadonlySignal<number> = computed(() => _navErrorDepth());

/**
 * The navigation in progress, for a progress bar or a dimmed page while chunks and data load:
 * `@if (navigation.pending()) { … }`. Auto-imported in a `.pdx` that reads it.
 *
 * `pending()` is true from the moment the before-hooks accept a navigation — not while one of them
 * is still asking "leave this page?" — until its route is published, or it is refused, denied or
 * abandoned. `to()` is its target, query included, while pending; a newer navigation replaces it.
 */
export const navigation: {
    readonly pending: ReadonlySignal<boolean>;
    readonly to: ReadonlySignal<string | null>;
} = {
    pending: computed(() => _navTarget() !== null),
    to: computed(() => _navTarget()),
};
