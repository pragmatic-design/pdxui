// Tests for global cache with invalidation, GC, and deduplication.

import { describe, it, expect } from 'vitest';
import { createCache } from '../src/reactivity/cache';
import { effect } from '../src/reactivity/signal';

describe('cache — basic operations', () => {
    it('set and get an entry', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('key1', { name: 'Alice' });

        const entry = cache.get('key1');
        expect(entry).toBeDefined();
        expect(entry!.data).toEqual({ name: 'Alice' });
        expect(entry!.key).toBe('key1');
    });

    it('has() returns true for existing entry', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('key1', 'data');
        expect(cache.has('key1')).toBe(true);
        expect(cache.has('key2')).toBe(false);
    });

    it('size reflects entry count', () => {
        const cache = createCache({ gcInterval: 0 });
        expect(cache.size).toBe(0);
        cache.set('a', 1);
        cache.set('b', 2);
        expect(cache.size).toBe(2);
    });

    it('set overwrites existing entry', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('key', 'old');
        cache.set('key', 'new');

        expect(cache.get('key')!.data).toBe('new');
        expect(cache.size).toBe(1);
    });

    it('remove deletes an entry', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('key', 'data');
        expect(cache.remove('key')).toBe(true);
        expect(cache.has('key')).toBe(false);
        expect(cache.remove('nonexistent')).toBe(false);
    });

    it('clear removes all entries', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.clear();
        expect(cache.size).toBe(0);
    });

    it('stores tags on entries', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('key', 'data', { tags: ['users', 'admin'] });

        const entry = cache.get('key');
        expect(entry!.tags).toEqual(['users', 'admin']);
    });

    it('staleAt is computed from staleTime', () => {
        const cache = createCache({ staleTime: 5000, gcInterval: 0 });
        const before = Date.now();
        cache.set('key', 'data');
        const entry = cache.get('key')!;

        expect(entry.staleAt).toBeGreaterThanOrEqual(before + 5000);
        expect(entry.staleAt).toBeLessThanOrEqual(Date.now() + 5000);
    });
});

describe('cache — invalidation', () => {
    it('invalidate by exact key', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('GET:/api/users', []);
        cache.set('GET:/api/roles', []);

        const count = cache.invalidate('GET:/api/users');
        expect(count).toBe(1);
        expect(cache.has('GET:/api/users')).toBe(false);
        expect(cache.has('GET:/api/roles')).toBe(true);
    });

    it('invalidate by wildcard pattern', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('GET:/api/users', []);
        cache.set('GET:/api/users/42', {});
        cache.set('GET:/api/users/42/roles', []);
        cache.set('GET:/api/roles', []);

        const count = cache.invalidate('GET:/api/users*');
        expect(count).toBe(3);
        expect(cache.has('GET:/api/roles')).toBe(true);
    });

    it('invalidate by tags', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('a', 1, { tags: ['users'] });
        cache.set('b', 2, { tags: ['users', 'admin'] });
        cache.set('c', 3, { tags: ['roles'] });

        const count = cache.invalidate(['users']);
        expect(count).toBe(2);
        expect(cache.has('c')).toBe(true);
    });

    it('invalidate by predicate', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('GET:/api/users', []);
        cache.set('POST:/api/users', null);
        cache.set('GET:/api/roles', []);

        const count = cache.invalidate((key) => key.startsWith('GET:'));
        expect(count).toBe(2);
        expect(cache.has('POST:/api/users')).toBe(true);
    });

    it('invalidateAll clears everything', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.invalidateAll();
        expect(cache.size).toBe(0);
    });

    it('invalidation bumps version signal', () => {
        const cache = createCache({ gcInterval: 0 });
        let versionCount = 0;
        effect(() => {
            cache.version();
            versionCount++;
        });

        expect(versionCount).toBe(1); // initial
        cache.set('key', 'data');
        cache.invalidate('key');
        expect(versionCount).toBe(2);
    });
});

describe('cache — subscribers and GC', () => {
    it('subscribe increments subscriber count', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('key', 'data');
        const unsub = cache.subscribe('key');

        expect(cache.get('key')!.subscribers).toBe(1);
        unsub();
        expect(cache.get('key')!.subscribers).toBe(0);
    });

    it('GC removes entries with 0 subscribers past gcTime', () => {
        const cache = createCache({ gcTime: 0, gcInterval: 0 }); // instant GC
        cache.set('key', 'data');
        const unsub = cache.subscribe('key');
        unsub(); // unsubscribe, marks unsubscribedAt

        const removed = cache.gc();
        expect(removed).toBe(1);
        expect(cache.has('key')).toBe(false);
    });

    it('GC does NOT remove entries with active subscribers', () => {
        const cache = createCache({ gcTime: 0, gcInterval: 0 });
        cache.set('key', 'data');
        cache.subscribe('key'); // active subscriber

        const removed = cache.gc();
        expect(removed).toBe(0);
        expect(cache.has('key')).toBe(true);
    });

    it('double unsubscribe is safe', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('key', 'data');
        const unsub = cache.subscribe('key');
        unsub();
        unsub(); // should not go negative
        expect(cache.get('key')!.subscribers).toBe(0);
    });
});

describe('cache — LRU eviction', () => {
    it('evicts oldest entry when maxEntries exceeded', () => {
        const cache = createCache({ maxEntries: 3, gcInterval: 0 });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        cache.set('d', 4); // evicts 'a'

        expect(cache.has('a')).toBe(false);
        expect(cache.has('b')).toBe(true);
        expect(cache.has('d')).toBe(true);
    });

    it('does NOT evict entries with active subscribers', () => {
        const cache = createCache({ maxEntries: 2, gcInterval: 0 });
        cache.set('a', 1);
        cache.subscribe('a'); // protect 'a'
        cache.set('b', 2);
        cache.set('c', 3); // would evict 'a', but it has subscriber → evicts 'b'

        expect(cache.has('a')).toBe(true);
        expect(cache.has('c')).toBe(true);
    });

    it('accessing an entry moves it to end of LRU', () => {
        const cache = createCache({ maxEntries: 3, gcInterval: 0 });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        cache.get('a'); // touch 'a', moves to end
        cache.set('d', 4); // evicts 'b' (now oldest)

        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(false);
    });
});

describe('cache — keyVersion', () => {
    it('keyVersion signal reacts to invalidation', () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('key', 'data');
        let version = 0;
        effect(() => {
            cache.keyVersion('key')();
            version++;
        });

        expect(version).toBe(1);
        cache.invalidate('key');
        expect(version).toBe(2);
    });
});

describe('cache — dispose', () => {
    it('dispose clears entries and stops GC timer', () => {
        const cache = createCache({ gcInterval: 100 });
        cache.set('a', 1);
        cache.dispose();
        expect(cache.size).toBe(0);
    });
});
