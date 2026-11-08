// A value fetched earlier than it is written (#239): a page a build generated carries its loaders'
// results, fetched when the build ran. Kept with the time they were fetched, they are as fresh as
// that time says — not fresh from the moment the page was opened.

import { describe, it, expect } from 'vitest';
import { createCache } from '../src/reactivity/cache';

describe('cache.set with fetchedAt', () => {
    it('counts the entry\'s age from when it was fetched', () => {
        const cache = createCache({ gcInterval: 0 });
        const fetchedAt = Date.now() - 10_000;
        cache.set('k', 1, { staleTime: 30_000, fetchedAt });
        const entry = cache.get('k')!;
        expect(entry.timestamp).toBe(fetchedAt);
        expect(entry.staleAt).toBe(fetchedAt + 30_000);
    });

    it('so a value fetched longer ago than its staleTime is stale as it is written', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('k', 1, { staleTime: 5_000, fetchedAt: Date.now() - 60_000 });
        expect(cache.get('k')!.staleAt).toBeLessThan(Date.now());
    });

    it('without it, the entry is fetched now', () => {
        const cache = createCache({ gcInterval: 0 });
        const before = Date.now();
        cache.set('k', 1, { staleTime: 1_000 });
        expect(cache.get('k')!.timestamp).toBeGreaterThanOrEqual(before);
    });
});
