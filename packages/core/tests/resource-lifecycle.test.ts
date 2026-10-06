// The lifecycle of resource(): a dynamic key, a dispose during a retry, and the ownership
// scope of resourceWhen's content.

import { describe, it, expect, vi } from 'vitest';
import { signal, effect } from '../src/reactivity/signal';
import { resource, resourceWhen } from '../src/reactivity/resource';
import { createCache } from '../src/reactivity/cache';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('resource — a dynamic key', () => {
    it('invalidating the CURRENT key after a keyFn change triggers the refetch', async () => {
        const cache = createCache({ gcInterval: 0 });
        const keySig = signal('k1');
        let fetches = 0;
        const res = resource(async () => { fetches++; return fetches; }, {
            key: () => keySig(),
            staleTime: 60_000,
            cache,
        });
        await tick();
        keySig.set('k2');
        await tick();

        const before = fetches;
        cache.invalidate('k2'); // the CURRENT key
        await tick();
        expect(fetches).toBeGreaterThan(before); // a resource still subscribed to k1 would not refetch

        res.dispose();
        cache.dispose();
    });

    it('the exposed key reflects the current one', async () => {
        const cache = createCache({ gcInterval: 0 });
        const keySig = signal('a');
        const res = resource(async () => 1, { key: () => keySig(), cache });
        await tick();
        keySig.set('b');
        await tick();
        expect(res.key).toBe('b'); // not a snapshot that stays 'a'
        res.dispose();
        cache.dispose();
    });
});

describe('resource — dispose during retry backoff', () => {
    it('the dispose stops the retry chain', async () => {
        vi.useFakeTimers();
        const cache = createCache({ gcInterval: 0 });
        let fetches = 0;
        const res = resource(async () => { fetches++; throw new Error('boom'); }, {
            retry: 3,
            cache,
        });
        await vi.advanceTimersByTimeAsync(0); // first fetch fails → backoff (300ms)
        const before = fetches;
        res.dispose();
        await vi.advanceTimersByTimeAsync(20_000);
        expect(fetches).toBe(before); // no fetch after the dispose
        vi.useRealTimers();
        cache.dispose();
    });
});

describe('resourceWhen — the ownership scope of the content', () => {
    it('the effects of the previous content are disposed when the state changes', async () => {
        const cache = createCache({ gcInterval: 0 });
        let resolveFetch: (v: string) => void;
        const res = resource(() => new Promise<string>(r => { resolveFetch = r; }), { cache });

        const probe = signal(0);
        let loadingEffectRuns = 0;

        const frag = resourceWhen(res, {
            loading: () => {
                const d = document.createElement('div');
                effect(() => { probe(); loadingEffectRuns++; });
                return d;
            },
            success: (v) => {
                const d = document.createElement('div');
                d.textContent = v;
                return d;
            },
        });
        document.body.appendChild(frag);
        await tick();
        const runsWhileLoading = loadingEffectRuns;

        resolveFetch!('done');
        await tick();

        probe.set(1); // the loading content's effect must NOT run again
        expect(loadingEffectRuns).toBe(runsWhileLoading);
        res.dispose();
        cache.dispose();
    });
});
