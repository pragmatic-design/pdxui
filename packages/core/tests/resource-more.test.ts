// resource() — the seven states, the cache in front of them, and resourceWhen()'s branches.
// resource-lifecycle.test.ts covers the dynamic key, the dispose during a retry and resourceWhen's
// ownership scope.
//
// The state machine is the feature: `loading` vs `reloading` vs `stale` is the difference between
// blanking the screen and refreshing behind the data, and each of those transitions is tested here.

import { describe, it, expect, vi } from 'vitest';
import { resource, resourceWhen } from '../src/reactivity/resource';
import { createCache } from '../src/reactivity/cache';
import { signal } from '../src/reactivity/signal';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A fetcher whose answers the test decides, one call at a time. */
function scripted<T>(...answers: (T | Error)[]) {
    let i = 0;
    const fn = vi.fn(async () => {
        const a = answers[Math.min(i++, answers.length - 1)];
        if (a instanceof Error) throw a;
        return a;
    });
    return fn;
}

describe('the first load', () => {
    it('goes idle → loading → success and exposes the data', async () => {
        const cache = createCache();
        const res = resource(scripted('hello'), { cache, key: 'k1' });

        expect(res.state()).toBe('loading');
        expect(res.status().isLoading).toBe(true);
        expect(res.status().hasData).toBe(false);

        await tick();

        expect(res.state()).toBe('success');
        expect(res.data()).toBe('hello');
        expect(res.status()).toMatchObject({ isSuccess: true, isLoading: false, hasData: true });
        res.dispose();
    });

    it('ends in error, with the error readable', async () => {
        const boom = new Error('nope');
        const res = resource(scripted<string>(boom), { cache: createCache(), key: 'k2' });
        await tick();

        expect(res.state()).toBe('error');
        expect(res.error()).toBe(boom);
        expect(res.status()).toMatchObject({ isError: true, hasData: false });
        res.dispose();
    });

    it('calls onSuccess with the data and onError with the failure', async () => {
        const onSuccess = vi.fn();
        const onError = vi.fn();
        const boom = new Error('x');

        const ok = resource(scripted('v'), { cache: createCache(), key: 'a', onSuccess });
        const ko = resource(scripted<string>(boom), { cache: createCache(), key: 'b', onError });
        await tick();

        expect(onSuccess).toHaveBeenCalledWith('v');
        expect(onError).toHaveBeenCalledWith(boom);
        ok.dispose(); ko.dispose();
    });

    it('transforms the raw response before it is cached', async () => {
        const cache = createCache();
        const res = resource<number>(scripted({ n: 2 }) as unknown as () => Promise<number>, {
            cache, key: 'tr',
            transform: (raw) => (raw as { n: number }).n * 10,
        });
        await tick();

        expect(res.data()).toBe(20);
        expect(cache.get('tr')!.data, 'the untransformed value was cached').toBe(20);
        res.dispose();
    });
});

describe('enabled — the dependent query', () => {
    it('a false flag leaves it idle and never calls the fetcher', async () => {
        const fetcher = scripted('never');
        const res = resource(fetcher, { cache: createCache(), key: 'e1', enabled: false });
        await tick();

        expect(res.state()).toBe('idle');
        expect(res.status().isIdle).toBe(true);
        expect(fetcher).not.toHaveBeenCalled();
        res.dispose();
    });

    it('a predicate is re-read, so the query starts when its parent answers', async () => {
        const parentId = signal<number | null>(null);
        const fetcher = scripted('child');
        const res = resource(fetcher, {
            cache: createCache(), key: 'e2', enabled: () => parentId() !== null,
        });
        await tick();
        expect(fetcher).not.toHaveBeenCalled();

        parentId.set(7);
        await tick();

        expect(fetcher, 'the dependent query never started').toHaveBeenCalled();
        expect(res.data()).toBe('child');
        res.dispose();
    });
});

describe('the cache in front of the fetcher', () => {
    it('a fresh entry is served without asking the network', async () => {
        const cache = createCache();
        const fetcher = scripted('from-network');
        cache.set('shared', 'from-cache', { staleTime: 60_000 });

        const res = resource(fetcher, { cache, key: 'shared' });
        await tick();

        expect(res.data()).toBe('from-cache');
        expect(res.state()).toBe('success');
        expect(fetcher, 'a fresh cache entry was refetched anyway').not.toHaveBeenCalled();
        res.dispose();
    });

    it('a stale entry is shown at once and refreshed behind it', async () => {
        const cache = createCache();
        cache.set('st', 'old', { staleTime: -1 });   // already past its staleAt
        const res = resource(scripted('new'), { cache, key: 'st' });

        expect(res.data(), 'the stale value was not shown while refetching').toBe('old');
        expect(res.status().hasData).toBe(true);
        expect(res.state()).toBe('stale');
        expect(res.isPending(), 'a background refresh must be distinguishable from a first load')
            .toBe(true);

        await tick();
        expect(res.data()).toBe('new');
        expect(res.state()).toBe('success');
        res.dispose();
    });

    it('two resources on the same key share the entry', async () => {
        const cache = createCache();
        const a = resource(scripted('one'), { cache, key: 'same' });
        await tick();

        const fetcher = scripted('two');
        const b = resource(fetcher, { cache, key: 'same' });
        await tick();

        expect(b.data()).toBe('one');
        expect(fetcher, 'the second resource fetched what the first had already cached')
            .not.toHaveBeenCalled();
        a.dispose(); b.dispose();
    });

    it('an error keeps the data that was already there, and says stale', async () => {
        const cache = createCache();
        cache.set('keep', 'cached', { staleTime: -1 });
        const boom = new Error('offline');
        const res = resource(scripted<string>(boom), { cache, key: 'keep' });
        await tick();

        expect(res.error()).toBe(boom);
        expect(res.data(), 'a failed refresh threw away data the user could still read')
            .toBe('cached');
        expect(res.state()).toBe('stale');
        res.dispose();
    });

    it('every resource without a key gets its own', async () => {
        const a = resource(scripted('a'), { cache: createCache() });
        const b = resource(scripted('b'), { cache: createCache() });
        expect(a.key).not.toBe(b.key);
        await tick();
        a.dispose(); b.dispose();
    });
});

describe('retry', () => {
    it('retries up to the configured number and then reports the error', async () => {
        const boom = new Error('flaky');
        const fetcher = scripted<string>(boom, boom, boom);
        const res = resource(fetcher, { cache: createCache(), key: 'r1', retry: 2 });

        await tick(1500);   // 300ms + 600ms of backoff

        expect(fetcher.mock.calls.length, 'the retries did not run').toBe(3);
        expect(res.state()).toBe('error');
        expect(res.error()).toBe(boom);
        res.dispose();
    });

    it('stops retrying as soon as one attempt works', async () => {
        const fetcher = scripted<string>(new Error('once'), 'ok');
        const res = resource(fetcher, { cache: createCache(), key: 'r2', retry: 3 });

        await tick(600);

        expect(fetcher.mock.calls.length).toBe(2);
        expect(res.data()).toBe('ok');
        expect(res.state()).toBe('success');
        res.dispose();
    });
});

describe('refetch, mutate and abort', () => {
    it('refetch bypasses the cache even when the entry is fresh', async () => {
        const cache = createCache();
        const fetcher = scripted('one', 'two');
        const res = resource(fetcher, { cache, key: 'rf', staleTime: 60_000 });
        await tick();
        expect(res.data()).toBe('one');

        await res.refetch();

        expect(res.data(), 'refetch served the cached value instead of refetching').toBe('two');
        expect(fetcher.mock.calls.length).toBe(2);
        res.dispose();
    });

    it('mutate sets the value locally, and writes it to the cache', async () => {
        const cache = createCache();
        const res = resource(scripted('server'), { cache, key: 'mu' });
        await tick();

        res.mutate('optimistic');

        expect(res.data()).toBe('optimistic');
        expect(res.state()).toBe('local');
        expect(cache.get('mu')!.data, 'another resource on the same key would not see it')
            .toBe('optimistic');
        res.dispose();
    });

    it('a mutate clears a standing error', async () => {
        const res = resource(scripted<string>(new Error('x')), { cache: createCache(), key: 'mu2' });
        await tick();
        expect(res.error()).toBeTruthy();

        res.mutate('recovered');
        expect(res.error()).toBeUndefined();
        res.dispose();
    });

    it('a response that arrives after a newer request is discarded', async () => {
        const releases: ((v: string) => void)[] = [];
        const res = resource(() => new Promise<string>((r) => releases.push(r)), {
            cache: createCache(), key: 'gen',
        });

        const second = res.refetch();
        releases[1]('second');
        releases[0]('first');     // the superseded one answers last
        await second;
        await tick();

        expect(res.data(), 'a stale response overwrote a newer one').toBe('second');
        res.dispose();
    });

    it('abort leaves the state where it was rather than writing a cancelled result', async () => {
        let release: (v: string) => void = () => {};
        const res = resource(() => new Promise<string>((r) => { release = r; }), {
            cache: createCache(), key: 'ab',
        });
        expect(res.state()).toBe('loading');

        res.abort();
        release('too late');
        await tick();

        expect(res.data(), 'an aborted request still delivered its data').toBeUndefined();
        res.dispose();
    });

    it('after dispose, refetch and mutate do nothing', async () => {
        const fetcher = scripted('v');
        const res = resource(fetcher, { cache: createCache(), key: 'dp' });
        await tick();
        res.dispose();
        const calls = fetcher.mock.calls.length;

        await res.refetch();
        res.mutate('ignored');

        expect(fetcher.mock.calls.length).toBe(calls);
        expect(res.data(), 'a disposed resource still accepted a mutation').toBe('v');
    });

    it('dispose twice is not an error', async () => {
        const res = resource(scripted('v'), { cache: createCache(), key: 'dp2' });
        await tick();
        expect(() => { res.dispose(); res.dispose(); }).not.toThrow();
    });
});

describe('resourceWhen', () => {
    const mount = (frag: DocumentFragment) => {
        const host = document.createElement('div');
        host.appendChild(frag);
        document.body.appendChild(host);
        return host;
    };

    const node = (text: string) => {
        const el = document.createElement('span');
        el.textContent = text;
        return el;
    };

    it('renders loading, then success', async () => {
        const res = resource(scripted('data'), { cache: createCache(), key: 'w1' });
        const host = mount(resourceWhen(res, {
            loading: () => node('loading'),
            success: (d) => node(`ok:${d}`),
        }));

        expect(host.textContent).toBe('loading');
        await tick();
        expect(host.textContent).toBe('ok:data');

        res.dispose();
        host.remove();
    });

    it('renders the error branch, and its retry re-runs the fetch', async () => {
        const fetcher = scripted<string>(new Error('down'), 'recovered');
        const res = resource(fetcher, { cache: createCache(), key: 'w2' });
        const host = mount(resourceWhen(res, {
            loading: () => node('...'),
            success: (d) => node(d),
            error: (_e, retry) => {
                const b = document.createElement('button');
                b.textContent = 'retry';
                b.onclick = retry;
                return b;
            },
        }));
        await tick();
        expect(host.textContent).toBe('retry');

        host.querySelector('button')!.click();
        await tick();

        expect(host.textContent, 'the retry button did not refetch').toBe('recovered');
        res.dispose();
        host.remove();
    });

    it('falls back to the success branch when there is no stale branch', async () => {
        const cache = createCache();
        cache.set('w3', 'old', { staleTime: -1 });
        const res = resource(() => new Promise<string>(() => {}), { cache, key: 'w3' });

        const host = mount(resourceWhen(res, {
            loading: () => node('...'),
            success: (d) => node(`success:${d}`),
        }));

        expect(host.textContent, 'a stale state rendered nothing at all').toBe('success:old');
        res.dispose();
        host.remove();
    });

    it('uses the stale branch when it is given one', async () => {
        const cache = createCache();
        cache.set('w4', 'old', { staleTime: -1 });
        const res = resource(() => new Promise<string>(() => {}), { cache, key: 'w4' });

        const host = mount(resourceWhen(res, {
            success: (d) => node(`success:${d}`),
            stale: (d) => node(`stale:${d}`),
        }));

        expect(host.textContent).toBe('stale:old');
        res.dispose();
        host.remove();
    });

    it('renders nothing, rather than breaking, for a state it was given no handler for', async () => {
        const res = resource(scripted('data'), { cache: createCache(), key: 'w5' });
        const host = mount(resourceWhen(res, { success: (d) => node(d) }));

        expect(host.textContent, 'a missing loading handler rendered something').toBe('');
        await tick();
        expect(host.textContent).toBe('data');

        res.dispose();
        host.remove();
    });

    it('a mutate renders through the success branch', async () => {
        const res = resource(scripted('server'), { cache: createCache(), key: 'w6' });
        const host = mount(resourceWhen(res, { success: (d) => node(d) }));
        await tick();

        res.mutate('local');

        expect(host.textContent, 'the local state rendered nothing').toBe('local');
        res.dispose();
        host.remove();
    });

    it('replaces the previous branch instead of stacking onto it', async () => {
        const res = resource(scripted('data'), { cache: createCache(), key: 'w7' });
        const host = mount(resourceWhen(res, {
            loading: () => node('loading'),
            success: (d) => node(d),
        }));
        await tick();

        expect(host.querySelectorAll('span'), 'the loading branch was left in the DOM')
            .toHaveLength(1);
        res.dispose();
        host.remove();
    });
});
