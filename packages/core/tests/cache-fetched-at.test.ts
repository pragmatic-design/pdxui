// A value fetched earlier than it is written (#239): a page a build generated carries its loaders'
// results, fetched when the build ran. Kept with the time they were fetched, they are as fresh as
// that time says — not fresh from the moment the page was opened.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCache } from '../src/reactivity/cache';

/** The clock the cache reads, fixed: the entries' times are compared with it, not measured. */
const NOW = 1_800_000_000_000;

beforeEach(() => { vi.useFakeTimers({ now: NOW }); });
afterEach(() => { vi.useRealTimers(); });

describe('cache.set with fetchedAt', () => {
    it('counts the entry\'s age from when it was fetched', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('k', 1, { staleTime: 30_000, fetchedAt: NOW - 10_000 });
        const entry = cache.get('k')!;
        expect(entry.timestamp).toBe(NOW - 10_000);
        expect(entry.staleAt).toBe(NOW + 20_000);
    });

    it('so a value fetched longer ago than its staleTime is stale as it is written', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('k', 1, { staleTime: 5_000, fetchedAt: NOW - 60_000 });
        expect(cache.get('k')!.staleAt).toBe(NOW - 55_000);
    });

    it('without it, the entry is fetched now', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('k', 1, { staleTime: 1_000 });
        expect(cache.get('k')!.timestamp).toBe(NOW);
    });
});
