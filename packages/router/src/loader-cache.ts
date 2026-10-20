// A route loader's results, kept in core's cache (#148).
//
// Imported statically, so core's cache is in the entry of every routed app (~1.5 KB gzip). Loading
// it on demand was measured and rejected: the first navigation to meet a loader then waited for this
// module before its data, one network wave more than a landing page should cost
// (`packages/showcase/tests/first-paint-waves.spec.ts`).

import { effect, getDefaultCache } from '@pdxui/core';
import type { RouteConfig } from './types';

/** Where a level's result is kept: its call identity, apart from `@fetch`'s keys. */
const cacheKey = (identity: string): string => `loader|${identity}`;
/** The tag every entry of a pattern carries: `invalidate(['loader:/users/:id'])` drops them all. */
const loaderTag = (pattern: string): string => `loader:${pattern}`;

/** The result kept for a call, and whether it is younger than its `staleTime`; undefined when none is. */
export function keptResult(identity: string): { data: unknown; fresh: boolean } | undefined {
    const entry = getDefaultCache().get(cacheKey(identity));
    return entry ? { data: entry.data, fresh: Date.now() < entry.staleAt } : undefined;
}

/** A level's result, kept for the next time it is entered, under its `staleTime` (0 by default). */
export function keepResult(level: RouteConfig, identity: string, result: unknown): void {
    getDefaultCache().set(cacheKey(identity), result, {
        tags: [loaderTag(level.path)], staleTime: level.loaderStaleTime ?? 0, silent: true,
    });
}

/**
 * Call `onDropped` when the result kept for `identity` is dropped — an invalidation. A write of the
 * level's own result is silent and bumps nothing. Returns the disposer.
 */
export function watchKept(identity: string, onDropped: () => void): () => void {
    const cache = getDefaultCache();
    const key = cacheKey(identity);
    const version = cache.keyVersion(key);
    let first = true;
    return effect(() => {
        // The key comes from the address, and `keyVersion` looks it up in a Map: CodeQL takes calling
        // what that lookup returned as a call through a name the visitor chose. The check is the guard
        // it recognises, and it has to sit beside the call — a guard outside this closure does not
        // reach into it. `keyVersion` always returns a signal, so it always holds.
        if (typeof version === 'function') version();
        if (first) { first = false; return; }
        if (!cache.get(key)) onDropped();
    });
}

/**
 * The router is destroyed: the results its loaders kept belong to no level any more, and the next
 * router must not start from them. The cache's other entries — `@fetch`'s — stay.
 */
export function forgetKeptResults(): void {
    getDefaultCache().invalidate((key) => key.startsWith('loader|'));
}
