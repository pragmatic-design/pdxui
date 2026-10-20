// The breadcrumb's trail.
//
// The chain, made usable: a name instead of a pattern, and an href with the params filled in.
// Published into core's registry so `<pdx-breadcrumb>` can read it without `@pdxui/ui`
// depending on this package.

import { effect, $t, setRouteTrail } from '@pdxui/core';
import type { RouteCrumb } from '@pdxui/core';
import { isSegmentPrefix } from './matcher';
import type { RouteConfig } from './types';

/**
 * `/tickets/:id` + `{ id: '42' }` → `/tickets/42`. A crumb has to be somewhere you can go. The
 * constraint goes with the placeholder, as in navigation's `fillParams`: `/tickets/:id(number)` →
 * `/tickets/42`, never `/tickets/42(number)` (#566). A param the route did not match stays as written.
 */
function fillParams(pattern: string, params: Record<string, string>): string {
    // Match: `:id`, `:id(number)`, `:id?`. Groups: [1]=the name
    return pattern.replace(/:([A-Za-z0-9_]+)(?:\([^)]*\))?\??/g, (whole, name: string) => {
        const value = params[name];
        return value === undefined ? whole : encodeURIComponent(value);
    });
}

/**
 * The label a PAGE MODULE published for this path, when the route table has none.
 *
 * `@page { label: ticketLabel }` names a function, and a function cannot be written into the route
 * table the compiler scans: it lives in the page's own module, and that module is imported lazily,
 * after `createRouter` has already read the table. So the crumb is looked up live, from the
 * registration the module makes when it loads.
 */
function liveRoute(path: string): RouteConfig | undefined {
    const reg = (globalThis as { __pdx_routes?: RouteConfig[] }).__pdx_routes;
    return reg?.find(r => r.path === path);
}

/**
 * What a level of the trail is called, or undefined for a level that is not a crumb. A dictionary
 * KEY first: data in the table, so an ancestor a deep link never loaded still names
 * itself, translated with the route's params. Then a written label, then one a module published.
 */
function crumbLabel(level: RouteConfig, params: Record<string, string>): string | undefined {
    const key = level.labelKey ?? liveRoute(level.path)?.labelKey;
    if (key !== undefined) return $t(key, params);
    const declared = level.label ?? liveRoute(level.path)?.label;
    if (declared === undefined) return undefined;
    // A string label may name params — `label: 'Ticket :id'` — which is how a DIRECTIVE gets a
    // dynamic crumb from a value rather than from source to evaluate. A FUNCTION is the other
    // half, and the only one that can name the record: only the app can look a ticket up.
    return typeof declared === 'function' ? declared(params) : fillParams(declared, params);
}

/**
 * The trail is drawn inside an effect, disposed at the next navigation: a label that reads the
 * dictionary is drawn again when the language changes, or when the section holding it arrives.
 * Drawn once, it would keep the language it was built in.
 */
let _trailEffect: (() => void) | null = null;

/** The last navigation, so a registration arriving afterwards can draw the trail again. */
let _lastTrail: { matched: RouteConfig; params: Record<string, string>; ancestors: RouteConfig[] } | null = null;

/**
 * Draw the trail again when a page module registers a path that is IN it — which is the moment a
 * label the table could not carry becomes available. Anything else registering changes no crumb,
 * so it costs one string comparison and no work.
 */
function onRouteRegistered(path: string): void {
    const last = _lastTrail;
    if (!last) return;
    if (path !== last.matched.path && !isSegmentPrefix(path, last.matched.path)) return;
    publishTrail(last.matched, last.params, last.ancestors);
}

/**
 * Publish the trail of a matched route.
 *
 * `ancestors` is every ancestor BY PATH, not the render chain. The chain excludes a route that
 * renders no child outlet, and it is right to: `hasOutlet` is what stops `/owners` from being
 * treated as the parent of `/owners/new`. But a breadcrumb is navigation, not rendering — a reader
 * who came through `/tickets` is one click from it whether or not the detail renders inside it, and
 * a trail that skipped it would jump from the root to the leaf.
 *
 * What keeps this from inventing steps is the LABEL: a route with none contributes no crumb, so
 * `/owners` appears above `/owners/new` only if someone declared that it should.
 */
export function publishTrail(matched: RouteConfig, params: Record<string, string>, ancestors: RouteConfig[]): void {
    _lastTrail = { matched, params, ancestors };
    (globalThis as { __pdx_routeRegistered?: (p: string) => void }).__pdx_routeRegistered = onRouteRegistered;

    _trailEffect?.();
    _trailEffect = effect(() => {
        const crumbs: RouteCrumb[] = [];
        for (const level of [...ancestors, matched]) {
            // No label, no crumb. Falling back to the path would put URL segments in front of a
            // reader who already has the address bar, and would make a renamed route look renamed twice.
            const label = crumbLabel(level, params);
            if (label === undefined) continue;
            crumbs.push({ label, href: fillParams(level.path, params), current: level === matched });
        }
        setRouteTrail(crumbs);
    });
}
