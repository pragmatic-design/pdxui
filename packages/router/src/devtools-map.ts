// `__PDX_DEVTOOLS__.map()` (#272): the route graph, for an agent that would otherwise find the
// routes by clicking. Read from the routes the router was started with — the build's table on an
// app with `@page` — and from the guard checker the router asks on a navigation. Development only:
// `runtime.ts` installs it behind `DEV`.

import { $t } from '@pdxui/core';
import type { DevtoolsMapParam, DevtoolsMapRoute } from '@pdxui/core';
import type { Matcher } from './matcher';
import type { RouteConfig } from './types';

// Match: `:name`, `:name(constraint)` or `*`. Groups: [1]=name [2]=constraint. The constraint ends at
// the first `)`, as the matcher reads it.
const PARAM = /:([A-Za-z0-9_]+)(?:\(([^)]*)\))?|\*/g;

/** A pattern's params, in order, each with its type: the constraint's name or pattern, else `string`. */
export function paramsOf(path: string): DevtoolsMapParam[] {
    return Array.from(path.matchAll(PARAM), (m) => m[0] === '*'
        ? { name: '$rest', type: 'string' }
        : { name: m[1], type: m[2] || 'string' });
}

/**
 * What the route is called: its crumb's dictionary key translated, else a label written as a
 * string. A function label names a record — `Ticket 42` — and a map has no record to give it. A key
 * whose dictionary has not arrived yet (`$t` hands the key back) is no title either: an app that
 * loads its strings by section has not loaded the ones of a route nobody opened.
 */
function titleOf(route: RouteConfig): string | undefined {
    if (route.labelKey !== undefined) {
        const title = $t(route.labelKey);
        return title === route.labelKey ? undefined : title;
    }
    return typeof route.label === 'string' ? route.label : undefined;
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
