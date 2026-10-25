// `__PDX_DEVTOOLS__.map()` (#272): the route graph, for an agent that would otherwise find the
// routes by clicking. Read from the routes the router was started with — the build's table on an
// app with `@page` — and from the guard checker the router asks on a navigation. Development only:
// `runtime.ts` installs it behind `DEV`.

import { $t } from '@pdxui/core';
import type { DevtoolsMapParam, DevtoolsMapRoute } from '@pdxui/core';
import type { Matcher } from './matcher';
import type { RouteConfig } from './types';

/** `\w`, one character at a time. */
const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9_]/.test(ch);

/**
 * A pattern's params, in order, each with its type: the constraint's name or pattern, else `string`.
 *
 * One left-to-right scan, read as the matcher's `pathToRegex` reads a pattern: `:name`, an optional
 * `(constraint)` that ends at the first `)`, and `*` for the rest. Not a regex: a regex over a
 * pattern with repeated `:0((` runs in polynomial time (#67).
 */
export function paramsOf(path: string): DevtoolsMapParam[] {
    const params: DevtoolsMapParam[] = [];
    // The next `)` at or after a position, remembered: the scan only moves forward, so a `)` found
    // ahead stays the answer until it is passed, and none after a position means none after any later
    // one. Searched afresh for each parameter, a pattern with many `(` and no `)` was read once per
    // parameter, a quadratic scan the old 200 ms bound hid (#700).
    let close = -2;
    let searchedFrom = -1;
    const nextClose = (from: number): number => {
        if (searchedFrom >= 0 && from >= searchedFrom && (close === -1 || close >= from)) return close;
        searchedFrom = from;
        close = path.indexOf(')', from);
        return close;
    };
    let i = 0;
    while (i < path.length) {
        if (path[i] === '*') {
            params.push({ name: '$rest', type: 'string' });
            i++;
            continue;
        }
        if (path[i] !== ':' || !isWordChar(path[i + 1])) {
            i++;
            continue;
        }
        let end = i + 1;
        while (end < path.length && isWordChar(path[end])) end++;
        const name = path.slice(i + 1, end);
        let type = 'string';
        if (path[end] === '(') {
            const at = nextClose(end + 1);
            if (at > end + 1) {
                type = path.slice(end + 1, at);
                end = at + 1;
            }
        }
        params.push({ name, type });
        i = end;
    }
    return params;
}

/** A dictionary key translated, or nothing while its strings have not arrived (`$t` hands the key back). */
function translated(key: string): string | undefined {
    const text = $t(key);
    return text === key ? undefined : text;
}

/**
 * What the route is called: its crumb's dictionary key translated, else a label written as a
 * string; a route with no crumb, by its page's title, a key or a string the compiler read off
 * `@title` (#389). A function label names a record — `Ticket 42` — and a map has no record to give
 * it. A key whose dictionary has not arrived yet is no title either: an app that loads its strings
 * by section has not loaded the ones of a route nobody opened.
 */
function titleOf(route: RouteConfig): string | undefined {
    if (route.labelKey !== undefined) return translated(route.labelKey);
    if (route.label !== undefined) return typeof route.label === 'string' ? route.label : undefined;
    if (route.titleKey !== undefined) return translated(route.titleKey);
    return route.title;
}

/**
 * The route graph. `allows` is the guard's answer now — null when the checker answers
 * asynchronously, and then the access is left out rather than guessed.
 */
export function routeMap(
    routes: readonly RouteConfig[], matcher: Matcher<RouteConfig>, allows: (guard: string) => boolean | null,
): DevtoolsMapRoute[] {
    return routes.map((route) => {
        const entry: DevtoolsMapRoute = { path: route.path };
        const params = paramsOf(route.path);
        if (params.length) entry.params = params;
        const title = titleOf(route);
        if (title) entry.title = title;
        if (route.guard) entry.guard = route.guard;
        if (route.redirect) {
            entry.redirect = route.redirect;
            return entry;
        }
        // Every level's guard, as a navigation checks them: a parent that denies closes the child.
        const guards = matcher.chain(route).map((level) => level.guard).filter((g): g is string => !!g);
        if (guards.length) {
            const answers = guards.map(allows);
            if (answers.includes(false)) entry.access = false;
            else if (!answers.includes(null)) entry.access = true;
        }
        return entry;
    });
}
