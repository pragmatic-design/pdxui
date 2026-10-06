// The trail from the root of the app to the page in front of you.
//
// A `<pdx-breadcrumb>` that took `items` and nothing else would make every page in every application
// restate by hand a path the router already holds. The copy goes stale the day a route is renamed,
// silently, because nothing connects the two — the shape rule 1 of CONTRIBUTING.md calls a framework bug: if the developer
// is writing repetitive wiring, the wiring should have been generated from a declaration.
//
// Connecting them directly is not available. `@pdxui/ui` depends on core and must not start
// depending on `@pdxui/router`, so the trail lives HERE, as a registry: core holds it, the
// router fills it on every navigation, `<pdx-breadcrumb>` reads it when it is given no `items`.
// That is the same arrangement `setLocaleStrings` already uses for the library's own strings, and
// it keeps both halves depending on core alone.
//
// An app with no router never calls the setter, the trail stays empty, and a breadcrumb with no
// `items` renders nothing — which is the honest outcome: a component that guessed a trail from
// `location.pathname` would show URL segments where a reader expects names.

import { signal } from '../reactivity/signal';

/** One step of the trail. `current` marks the page you are on: it is not a link. */
export interface RouteCrumb {
    label: string;
    /** The path this crumb navigates to, with the route's params already filled in. */
    href: string;
    current: boolean;
}

const _trail = signal<RouteCrumb[]>([]);

/** The matched chain as crumbs, outermost first. Reactive: a reader re-runs on every navigation. */
export function routeTrail(): RouteCrumb[] {
    return _trail();
}

/** Called by the router on every navigation. An application does not call this. */
export function setRouteTrail(crumbs: RouteCrumb[]): void {
    _trail.set(crumbs);
}

/** Back to empty — for a test, and for an app that tears its router down. */
export function clearRouteTrail(): void {
    _trail.set([]);
}
