// The load of a lazy page's module: for a page the outlet builds, and for one a generated page
// already holds (`hydrate.ts`).

import { trackUrgentLoad } from '@pdxui/core';
import type { ResolvedRoute } from './active';
import type { RegisteredRoute } from './registered-routes';
import { takeRoutePrefetch, cancelOtherPrefetches } from './prefetch';

/**
 * Load a lazy page's module: the prefetch already in flight for it, or the table's literal
 * `import()`, or the registration's `file` — see the note where the outlet's `_activate` calls it.
 */
export function loadPage(route: ResolvedRoute, config: RegisteredRoute, tableLoad: (() => Promise<unknown>) | undefined): Promise<unknown> {
    const prefetched = takeRoutePrefetch(route.path);
    cancelOtherPrefetches(route.path);
    const load = prefetched
        ? () => prefetched
        : tableLoad ?? (() => import(/* @vite-ignore */ config.file!));
    return trackUrgentLoad(load());
}
