// Where the outlet asks for the route a generated page already holds (#160) — the door
// `installRouteAdoption()` (`hydrate.ts`) opens. Closed, the outlet builds every route, and an app
// that is not generated carries none of the code that looks for one.

import type { ResolvedRoute } from './active';
import type { RegisteredRoute } from './registered-routes';

/** A layout of the tree and the host its pages go into, as the outlet's layout stack holds them. */
export interface ServerLayout {
    tag: string;
    element: HTMLElement;
    host: HTMLElement;
}

/** The layouts and the page the server wrote for the route being shown. */
export interface ServerTree {
    readonly layouts: ServerLayout[];
    readonly page: HTMLElement;
}

/**
 * Take what the server wrote into `outlet` for `route` — `config` its registration, `depth` the
 * outlet's level — or null, having removed what it wrote when it is not that route.
 */
export type TakeServerTree = (
    outlet: HTMLElement,
    route: ResolvedRoute | null,
    config: RegisteredRoute | undefined,
    depth: number,
) => ServerTree | null;

export const adoption: { take: TakeServerTree | null } = { take: null };
