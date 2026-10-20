// Typed routes (#150): the types `navigate()` and `<pdx-link>` are checked against.
//
// The build and the dev server write `.pdx/routes.d.ts` from the project's `@page` patterns
// (`@pdxui/compiler`'s route-types), which augments `RouteRegistry` with one key per pattern and its
// params as the value:
//
//   declare module '@pdxui/router' {
//     interface RouteRegistry { '/': {}; '/users/:id': { id: number } }
//   }
//
// With the registry empty — no generated file, or code outside an app — every path is a string and
// every param a string or a number, as before.

import { context, type Context, type Signal } from '@pdxui/core';

/**
 * One key per `@page` pattern, its params as the value. Augmented by the generated
 * `.pdx/routes.d.ts`. The marker member is not a route: it keeps the interface from being empty and
 * is excluded from the patterns.
 */
export interface RouteRegistry {
    readonly '#routes'?: never;
}

type Registered = Exclude<keyof RouteRegistry, '#routes'> & string;

/** A route pattern the app declares — any string while the registry is empty. */
export type RoutePath = [Registered] extends [never] ? string : Registered;

/** The params of the pattern `P`: typed from its constraints once the registry knows it. */
export type RouteParams<P extends string> = P extends Registered
    ? RouteRegistry[P]
    : Record<string, string | number>;

/**
 * The context token the router outlet provides the current route's params under (#495): a signal of
 * the raw params, read below the outlet with `inject(RouteParams, el, null)`. The same name as the type
 * above, as a value: `RouteParams<'/users/:id'>` is a route's typed params, `RouteParams` the token.
 */
export const RouteParams: Context<Signal<Record<string, string>>> = context('route-params');

/** Navigation state: kept with the history entry, not in the URL. */
export type NavigationState = Record<string, unknown>;

/** `navigate`: to a route by its pattern, or to a concrete URL with `navigate.url`. */
export interface Navigate {
    <P extends RoutePath>(path: P, ...args: RouteArgs<P>): void;
    /** A concrete URL, query and hash included: checked by nothing but the router's own match. */
    url(url: string, state?: NavigationState): void;
}

/**
 * What follows the path in `navigate(path, …)`: the params — required when the pattern has any —
 * then the state. With the registry empty, the params are optional, as before.
 */
export type RouteArgs<P extends string> = [Registered] extends [never]
    ? [params?: RouteParams<P>, state?: NavigationState]
    : keyof RouteParams<P> extends never
        ? [params?: RouteParams<P>, state?: NavigationState]
        : [params: RouteParams<P>, state?: NavigationState];
