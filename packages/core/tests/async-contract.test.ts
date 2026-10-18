// The execution contract of a read source (beta spec, docs/language/beta/data.md → «The execution
// contract»), one suite for every source: `resource()`, a compiled `@fetch`, `useQuery`.
//
// Each source is driven through a fake transport that records every call and answers when the test
// says so, so a race is written as the order of the answers rather than left to timers. The cases
// are numbered as the spec numbers its rules; this file holds:
//
//   - case 1 (E1, latest wins): two requests in flight, the older one answering last, does not
//     overwrite the newer one's data;
//   - case 2 (E2, a signal per request): a superseded, aborted or disposed request is aborted on the
//     transport (#256);
//   - case 3 (E3, cancelling is not failing): abort() returns the source to its settled state, and a
//     transport timeout is an HttpTimeoutError (#255);
//   - case 6 (E6, one layer retries, only reads): the transport calls of a failing read are the
//     source's retries and no more, a write is not replayed unless it asks, a 4xx is not retried
//     (#257);
//   - case 8 (E8, disposed with its scope): a source created in a component's setup lets go of its
//     cache subscription when the component goes, so the entry is collected, and a retry waiting in
//     its backoff does not fire (#254).
//
// The issue for E7 adds its case here; the route-loader rows come with the loaders.

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const { component, html, resource, useQuery, signal, createCache, getDefaultCache } = core;

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

/** A transport that records each call and answers only when the test says so. */
function heldTransport<T>() {
    const calls: unknown[] = [];
    const pending: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
    return {
        calls,
        call(arg?: unknown): Promise<T> {
            calls.push(arg);
            return new Promise<T>((resolve, reject) => { pending.push({ resolve, reject }); });
        },
        answer(index: number, value: T) { pending[index].resolve(value); },
        fail(index: number, error: unknown = new Error('network')) { pending[index].reject(error); },
    };
}

let tagSeq = 0;
/** Define a component whose setup runs `make`, mount it, and hand back the element. */
async function mountWith(make: () => unknown): Promise<HTMLElement> {
    const tag = `app-async-contract-${++tagSeq}`;
    component(tag, { setup() { make(); return {}; }, render: () => html`<i></i>` });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await settle();
    return el;
}

/** Compile a `.pdx` source and run its module against core, as the build would (render-parity's bridge). */
function defineCompiled(name: string, src: string): void {
    const { code } = compile(src, `${name}.pdx`, [], undefined, {});
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

/** A JSON response, the shape the HTTP client reads. */
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

// ─── resource() ─────────────────────────────────────────────────────

describe('resource()', () => {
    it('case 1 — latest wins: an older answer arriving last does not overwrite the newer data', async () => {
        const t = heldTransport<string>();
        const id = signal(1);
        const cache = createCache({ gcInterval: 0 });
        const r = resource(() => t.call(id()), { key: () => `user:${id()}`, cache });
        await settle();
        id.set(2);
        await settle();
        expect(t.calls, 'the second request never started').toEqual([1, 2]);

        t.answer(1, 'two');
        await settle();
        t.answer(0, 'one');
        await settle();
        expect(r.data(), 'the older answer overwrote the newer one').toBe('two');
        r.dispose();
    });

    it('case 8 — created in a component, it releases its cache subscription when the component goes', async () => {
        const t = heldTransport<string[]>();
        const cache = createCache({ gcInterval: 0, gcTime: 0 });
        const el = await mountWith(() => resource(() => t.call(), { key: 'users', cache }));
        t.answer(0, ['ada']);
        await settle();
        expect(cache.get('users')?.subscribers, 'control: the mounted resource holds the entry').toBe(1);

        el.remove();
        await settle();
        expect(cache.get('users')?.subscribers, 'the destroyed component still holds its entry').toBe(0);
        cache.gc();
        expect(cache.has('users'), 'the entry outlived its gcTime: nothing let go of it').toBe(false);
    });

    it('case 8 — a retry waiting in its backoff does not fire after the component goes', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const t = heldTransport<string[]>();
        const cache = createCache({ gcInterval: 0 });
        const tag = `app-async-contract-${++tagSeq}`;
        component(tag, { setup() { resource(() => t.call(), { key: 'retrying', cache, retry: 1 }); return {}; }, render: () => html`<i></i>` });
        const el = document.createElement(tag);
        document.body.appendChild(el);
        await vi.advanceTimersByTimeAsync(0);
        expect(t.calls.length, 'the first request never started').toBe(1);

        t.fail(0);
        await vi.advanceTimersByTimeAsync(0); // the failure is in; the retry now waits in its backoff
        el.remove();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(t.calls.length, 'a request went out after its component was destroyed').toBe(1);
    });

    it('case 2 — the request a newer one supersedes is aborted on the transport', async () => {
        const t = heldTransport<string>();
        const id = signal(1);
        const cache = createCache({ gcInterval: 0 });
        const r = resource(({ signal: s }) => t.call(s), { key: () => `ac-signal:${id()}`, cache });
        await settle();
        id.set(2);
        await settle();
        const [first, second] = t.calls as AbortSignal[];
        expect(first, 'the fetcher received no AbortSignal').toBeInstanceOf(AbortSignal);
        expect(first.aborted, 'the superseded request still runs on the network').toBe(true);
        expect(second.aborted, 'control: the current request is not aborted').toBe(false);
        r.dispose();
        expect(second.aborted, 'dispose did not abort the request in flight').toBe(true);
    });

    it('case 2 — abort() aborts the request on the transport', async () => {
        const t = heldTransport<string>();
        const r = resource(({ signal: s }) => t.call(s), { key: 'ac-signal-abort', cache: createCache({ gcInterval: 0 }) });
        await settle();
        const [s] = t.calls as AbortSignal[];
        expect(s).toBeInstanceOf(AbortSignal);
        r.abort();
        expect(s.aborted, 'abort() left the request running').toBe(true);
        r.dispose();
    });

    it('case 2 — httpResource hands the signal to the HTTP client', async () => {
        const seen: (AbortSignal | undefined)[] = [];
        vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
            seen.push(init?.signal ?? undefined);
            return new Promise<Response>(() => {});
        }));
        core.setDefaultClient(core.createHttpClient({ retry: false, timeout: 0 }));
        const r = core.httpResource<string>('/api/ac-http-resource');
        await settle();
        expect(seen[0], 'the HTTP request carries no signal').toBeInstanceOf(AbortSignal);
        r.dispose();
        expect(seen[0]!.aborted, 'disposing the httpResource left its request running').toBe(true);
    });

    it('case 3 — abort() during a first load returns to idle, and the error is not touched', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r = resource(() => t.call(), { key: 'ac-abort-first', cache, retry: 0 });
        await settle();
        expect(r.state(), 'control: the first load is in flight').toBe('pending');
        const before = r.error();
        r.abort();
        expect(r.state(), 'cancelling left the source loading').toBe('idle');
        expect(r.pending(), 'a spinner bound to pending() never stops').toBe(false);
        expect(r.error(), 'cancelling is not failing: error() changed').toBe(before);

        t.answer(0, 'late');
        await settle();
        expect(r.data(), 'the cancelled request wrote its answer').toBeUndefined();
        expect(r.state()).toBe('idle');
        r.dispose();
    });

    it('case 3 — abort() during a refresh returns to success, with the data kept', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r = resource(() => t.call(), { key: 'ac-abort-refresh', cache, retry: 0 });
        await settle();
        t.answer(0, 'first');
        await settle();
        void r.refetch();
        await settle();
        expect([r.state(), r.pending()], 'control: the refresh is in flight').toEqual(['success', true]);
        r.abort();
        expect([r.state(), r.pending()], 'cancelling a refresh left the source refreshing').toEqual(['success', false]);
        expect(r.data()).toBe('first');

        t.answer(1, 'second');
        await settle();
        expect(r.data(), 'the cancelled refresh wrote its answer').toBe('first');
        r.dispose();
    });

    it('case 3 — a transport timeout settles error with an HttpTimeoutError, attempted once', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        let attempts = 0;
        // As fetch does: a signal aborted with a reason rejects with that reason.
        vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
            attempts++;
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
            });
        }));
        const client = core.createHttpClient({ timeout: 1000 });
        const cache = createCache({ gcInterval: 0 });
        const r = resource(() => client.get('/api/ac-timeout'), { key: 'ac-timeout', cache, retry: 0 });
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(20_000);

        expect(r.state(), 'a timed-out request did not fail the source').toBe('error');
        expect(r.error(), 'a timeout reported as something else').toBeInstanceOf(core.HttpTimeoutError);
        expect((r.error() as Error).name).not.toBe('AbortError');
        expect(attempts, 'the retry middleware replayed a timed-out request').toBe(1);
        r.dispose();
    });

    it('control: a resource created outside any component is not disposed by anything', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r = resource(() => t.call(), { key: 'module-level', cache });
        t.answer(0, 'kept');
        await settle();
        expect(cache.get('module-level')?.subscribers).toBe(1);
        r.dispose();
        expect(cache.get('module-level')?.subscribers).toBe(0);
    });
});

// ─── a compiled @fetch ──────────────────────────────────────────────

describe('a compiled @fetch', () => {
    function stubFetch() {
        const t = heldTransport<Response>();
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => t.call(String(input))));
        core.setDefaultClient(core.createHttpClient({ retry: false, timeout: 0 }));
        return t;
    }

    it('case 1 — latest wins on a reactive URL', async () => {
        const t = stubFetch();
        defineCompiled('acfetchlatest', "<template><p>{{ user.data()?.name ?? '' }}</p><button @click=\"id = 2\">2</button></template>\n"
            + "<script setup>\nlet id = $signal(1);\n@fetch user: 'GET /api/ac-latest/${id}' as User;\n</script>\n");
        const el = document.createElement('app-acfetchlatest');
        document.body.appendChild(el);
        await settle();
        el.querySelector('button')!.click();
        await settle();
        expect(t.calls.length, 'the second request never started').toBe(2);

        t.answer(1, json({ name: 'two' }));
        await settle();
        t.answer(0, json({ name: 'one' }));
        await settle();
        expect(el.querySelector('p')!.textContent, 'the older answer overwrote the newer one').toBe('two');
    });

    it('case 2 — a superseded @fetch request, and the one in flight when the component goes, are aborted', async () => {
        const signals: AbortSignal[] = [];
        vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.signal) signals.push(init.signal);
            return new Promise<Response>(() => {});
        }));
        core.setDefaultClient(core.createHttpClient({ retry: false, timeout: 0 }));
        defineCompiled('acfetchsignal', "<template><p></p><button @click=\"id = 2\">2</button></template>\n"
            + "<script setup>\nlet id = $signal(1);\n@fetch user: 'GET /api/ac-signal/${id}' as User;\n</script>\n");
        const el = document.createElement('app-acfetchsignal');
        document.body.appendChild(el);
        await settle();
        el.querySelector('button')!.click();
        await settle();
        expect(signals.length, 'the @fetch requests carry no signal').toBe(2);
        expect(signals[0].aborted, 'the superseded @fetch request still runs').toBe(true);
        expect(signals[1].aborted).toBe(false);
        el.remove();
        await settle();
        expect(signals[1].aborted, 'the request in flight outlived its component').toBe(true);
    });

    it('case 8 — the component going releases the @fetch cache subscription', async () => {
        const t = stubFetch();
        defineCompiled('acfetchdispose', "<template><p>{{ users.data()?.length ?? 0 }}</p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/ac-dispose' as string[];\n</script>\n");
        const el = document.createElement('app-acfetchdispose');
        document.body.appendChild(el);
        await settle();
        t.answer(0, json(['ada']));
        await settle();
        const cache = getDefaultCache();
        expect(cache.get('GET:/api/ac-dispose')?.subscribers, 'control: the mounted @fetch holds the entry').toBe(1);

        el.remove();
        await settle();
        expect(cache.get('GET:/api/ac-dispose')?.subscribers, 'the destroyed component still holds its @fetch entry').toBe(0);
    });

    it('case 8 — a @fetch retry waiting in its backoff does not fire after the component goes', async () => {
        const t = stubFetch();
        defineCompiled('acfetchretry', "<template><p></p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/ac-retry' as string[] { retry: 1 };\n</script>\n");
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const el = document.createElement('app-acfetchretry');
        document.body.appendChild(el);
        await vi.advanceTimersByTimeAsync(0);
        expect(t.calls.length, 'the first request never started').toBe(1);

        t.fail(0, new TypeError('network'));
        await vi.advanceTimersByTimeAsync(0);
        el.remove();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(t.calls.length, 'a request went out after its component was destroyed').toBe(1);
    });
});

// ─── useQuery ───────────────────────────────────────────────────────

describe('useQuery', () => {
    it('case 1 — latest wins: an older answer arriving last does not overwrite the newer data', async () => {
        const t = heldTransport<string>();
        const id = signal(1);
        const q = useQuery(() => t.call(id()), { key: () => `ac-query:${id()}`, refetchOnFocus: false, refetchOnReconnect: false, retry: 0 });
        await settle();
        id.set(2);
        await settle();
        expect(t.calls).toEqual([1, 2]);

        t.answer(1, 'two');
        await settle();
        t.answer(0, 'one');
        await settle();
        expect(q.data(), 'the older answer overwrote the newer one').toBe('two');
        q.dispose();
    });

    it('case 2 — the query function receives the signal, and a superseded or disposed request is aborted', async () => {
        const t = heldTransport<string>();
        const id = signal(1);
        const q = useQuery(({ signal: s }) => t.call(s), { key: () => `ac-query-signal:${id()}`, refetchOnFocus: false, refetchOnReconnect: false, retry: 0 });
        await settle();
        id.set(2);
        await settle();
        const [first, second] = t.calls as AbortSignal[];
        expect(first, 'the query function received no AbortSignal').toBeInstanceOf(AbortSignal);
        expect(first.aborted, 'the superseded query still runs').toBe(true);
        expect(second.aborted).toBe(false);
        q.dispose();
        expect(second.aborted, 'dispose did not abort the query in flight').toBe(true);
    });
});

// ─── case 7: consumers of one key share one request and one value ───

describe('case 7 — consumers of one key share one request and one value', () => {
    it('two components on one key make one request; it goes on until the last of them goes', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const make = () => resource(({ signal: s }) => t.call(s), { key: 'ac-shared-mount', cache });
        const a = await mountWith(make);
        const b = await mountWith(make);
        expect(t.calls.length, 'two consumers of one key made two requests').toBe(1);
        const [s] = t.calls as AbortSignal[];
        a.remove();
        await settle();
        expect(s.aborted, 'the request was aborted while a consumer still waited for it').toBe(false);
        b.remove();
        await settle();
        expect(s.aborted, 'the last consumer went and the request kept running').toBe(true);
    });

    it('both consumers receive the shared answer', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r1 = resource(() => t.call(), { key: 'ac-shared-value', cache });
        const r2 = resource(() => t.call(), { key: 'ac-shared-value', cache });
        await settle();
        expect(t.calls.length).toBe(1);
        t.answer(0, 'v');
        await settle();
        expect([r1.data(), r2.data()]).toEqual(['v', 'v']);
        expect([r1.state(), r2.state()]).toEqual(['success', 'success']);
        r1.dispose(); r2.dispose();
    });

    it('one consumer\'s refetch() during the request supersedes it for both, and both receive the new value', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r1 = resource(({ signal: s }) => t.call(s), { key: 'ac-shared-refetch', cache });
        const r2 = resource(({ signal: s }) => t.call(s), { key: 'ac-shared-refetch', cache });
        await settle();
        void r1.refetch();
        await settle();
        expect(t.calls.length, 'a refetch made more than one new request').toBe(2);
        expect((t.calls[0] as AbortSignal).aborted, 'the superseded shared request still runs').toBe(true);
        t.answer(1, 'new');
        await settle();
        expect([r1.data(), r2.data()], 'a consumer missed the new value').toEqual(['new', 'new']);
        expect(r2.state()).toBe('success');
        r1.dispose(); r2.dispose();
    });

    it('one consumer\'s mutate(v) reaches the other, and no request is made', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r1 = resource(() => t.call(), { key: 'ac-shared-mutate', cache });
        const r2 = resource(() => t.call(), { key: 'ac-shared-mutate', cache });
        await settle();
        t.answer(0, 'v');
        await settle();
        r1.mutate('m');
        await settle();
        expect(r2.data(), 'the other consumer kept the old value').toBe('m');
        expect(t.calls.length, 'mutate made a request').toBe(1);
        r1.dispose(); r2.dispose();
    });

    it('a refetch() after the answer reaches the other consumer', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r1 = resource(() => t.call(), { key: 'ac-shared-later', cache });
        const r2 = resource(() => t.call(), { key: 'ac-shared-later', cache });
        await settle();
        // However many requests the first load made, all of them answer 'first'.
        for (let i = 0; i < t.calls.length; i++) t.answer(i, 'first');
        await settle();
        expect(r2.data()).toBe('first');
        const before = t.calls.length;
        void r1.refetch();
        await settle();
        expect(t.calls.length, 'the refetch made no request, or more than one').toBe(before + 1);
        t.answer(before, 'second');
        await settle();
        expect(r2.data(), 'the other consumer kept the old value until its own next fetch').toBe('second');
        r1.dispose(); r2.dispose();
    });

    it('with staleTime: 0, a resource writing its own result does not refetch', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r = resource(() => t.call(), { key: 'ac-shared-loop', cache, staleTime: 0 });
        await settle();
        t.answer(0, 'v');
        await settle();
        await settle();
        expect(t.calls.length, 'its own write triggered a refetch').toBe(1);
        r.dispose();
    });
});

// ─── case 6: one layer retries, and only reads ──────────────────────

describe('case 6 — one layer retries, and only reads', () => {
    /** A fetch that answers `statuses` in turn, then 200; counts the calls. */
    function scriptedFetch(statuses: number[]) {
        const seen = { calls: 0 };
        vi.stubGlobal('fetch', vi.fn(() => {
            const status = statuses[seen.calls++];
            return Promise.resolve(status
                ? new Response('{}', { status, headers: { 'content-type': 'application/json' } })
                : json({ ok: true }));
        }));
        return seen;
    }
    const always503 = () => Array.from({ length: 50 }, () => 503);

    it('a compiled @fetch with retry: 2 over the default client: three transport calls, not twelve', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const seen = scriptedFetch(always503());
        core.setDefaultClient(core.createHttpClient({ timeout: 0 })); // its own retry on, as by default
        defineCompiled('acretryfetch', "<template><p></p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/ac-retry-fetch' as string[] { retry: 2 };\n</script>\n");
        document.body.appendChild(document.createElement('app-acretryfetch'));
        await vi.advanceTimersByTimeAsync(60_000);
        expect(seen.calls, 'the transport retried under the source\'s retries').toBe(3);
    });

    it('control — a read that fails twice then succeeds with retry: 2 is three calls', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const seen = scriptedFetch([503, 503]);
        core.setDefaultClient(core.createHttpClient({ timeout: 0 }));
        defineCompiled('acretryfetchok', "<template><p></p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/ac-retry-ok' as string[] { retry: 2 };\n</script>\n");
        document.body.appendChild(document.createElement('app-acretryfetchok'));
        await vi.advanceTimersByTimeAsync(60_000);
        expect(seen.calls).toBe(3);
    });

    it('resource(): a 404 is not retried — retrying cannot fix it', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        let calls = 0;
        const r = resource(() => { calls++; return Promise.reject(new core.HttpError(404, 'Not Found', '/api/x')); },
            { key: 'ac-retry-404', cache: createCache({ gcInterval: 0 }), retry: 3 });
        await vi.advanceTimersByTimeAsync(60_000);
        expect(calls, 'a 404 was retried').toBe(1);
        expect(r.state()).toBe('error');
        r.dispose();
    });

    it('resource(): a network failure is retried, with retry: 2 three calls in all', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        let calls = 0;
        const r = resource(() => { calls++; return calls <= 2 ? Promise.reject(new TypeError('network')) : Promise.resolve('ok'); },
            { key: 'ac-retry-network', cache: createCache({ gcInterval: 0 }), retry: 2 });
        await vi.advanceTimersByTimeAsync(60_000);
        expect(calls).toBe(3);
        expect(r.data()).toBe('ok');
        r.dispose();
    });

    it('useQuery over its own fetcher: retry: 2 and a read failing twice is three calls', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        let calls = 0;
        const q = useQuery(() => { calls++; return calls <= 2 ? Promise.reject(new TypeError('network')) : Promise.resolve('ok'); },
            { key: 'ac-retry-query', retry: 2, refetchOnFocus: false, refetchOnReconnect: false });
        await vi.advanceTimersByTimeAsync(60_000);
        expect(calls).toBe(3);
        expect(q.data()).toBe('ok');
        q.dispose();
    });

    it('a PUT that fails with a 503 is sent once: a write is not replayed by default', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const seen = scriptedFetch(always503());
        const caught = core.createHttpClient({ timeout: 0 }).put('/api/ac-put', { id: 7 }).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(await caught).toBeInstanceOf(core.HttpError);
        expect(seen.calls, 'the PUT was replayed').toBe(1);
    });

    it('the same PUT asking for retry: 2 is sent three times', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const seen = scriptedFetch(always503());
        const caught = core.createHttpClient({ timeout: 0 }).put('/api/ac-put', { id: 7 }, { retry: 2 }).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(await caught).toBeInstanceOf(core.HttpError);
        expect(seen.calls, 'retry: 2 on the request was not honoured').toBe(3);
    });

    it('retry: false on a GET turns the transport retry off for that request', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const seen = scriptedFetch(always503());
        const caught = core.createHttpClient({ timeout: 0 }).get('/api/ac-get', { retry: false }).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(await caught).toBeInstanceOf(core.HttpError);
        expect(seen.calls).toBe(1);
    });
});

// ─── the async vocabulary (#141): one table, every source ───────────
//
// data.md → «The async vocabulary»: data(), error(), state(), pending(), stale(), the same sequence
// for resource(), useQuery and a compiled @fetch; a mutation for the rows without stale().

/** What each source shows, read in one go: the row of the table the source is on. */
type Row = { state: string; pending: boolean; stale: boolean; data: unknown; error: unknown };
interface VocabularySource {
    row(): Row;
    refetch(): Promise<void>;
    dispose(): void;
}

/** resource() and useQuery over one held transport, as a VocabularySource. */
function sources(t: ReturnType<typeof heldTransport<string>>, key: string, extra: { retry?: number; staleTime?: number } = {}): [string, () => VocabularySource][] {
    const read = (s: { state(): string; pending(): boolean; stale(): boolean; data(): unknown; error(): unknown }) => (): Row =>
        ({ state: s.state(), pending: s.pending(), stale: s.stale(), data: s.data(), error: s.error() });
    return [
        ['resource()', () => {
            const r = resource(() => t.call(), { key, cache: createCache({ gcInterval: 0 }), retry: extra.retry ?? 0, staleTime: extra.staleTime });
            return { row: read(r), refetch: () => r.refetch(), dispose: () => r.dispose() };
        }],
        ['useQuery', () => {
            const q = useQuery(() => t.call(), { key, retry: extra.retry ?? 0, staleTime: extra.staleTime, refetchOnFocus: false, refetchOnReconnect: false });
            return { row: read(q), refetch: () => q.refetch(), dispose: () => q.dispose() };
        }],
    ];
}

let vocabularySeq = 0;
for (const name of ['resource()', 'useQuery']) {
    describe(`the async vocabulary — ${name}`, () => {
        const make = (t: ReturnType<typeof heldTransport<string>>, extra?: { retry?: number; staleTime?: number }) =>
            sources(t, `ac-vocab-${name}-${++vocabularySeq}`, extra).find(([n]) => n === name)![1]();

        it('first load, then a hand refetch of a fresh value: pending, success, success while pending, success', async () => {
            const t = heldTransport<string>();
            const s = make(t);
            await settle();
            expect(s.row(), 'first load in flight').toEqual({ state: 'pending', pending: true, stale: false, data: undefined, error: null });
            t.answer(0, 'v1');
            await settle();
            expect(s.row(), 'loaded').toEqual({ state: 'success', pending: false, stale: false, data: 'v1', error: null });
            void s.refetch();
            await settle();
            expect(s.row(), 'refreshing a fresh value').toEqual({ state: 'success', pending: true, stale: false, data: 'v1', error: null });
            t.answer(1, 'v2');
            await settle();
            expect(s.row()).toEqual({ state: 'success', pending: false, stale: false, data: 'v2', error: null });
            s.dispose();
        });

        it('case 4 (E4) — a failed refresh keeps the data: error, stale, not pending; a later success clears it', async () => {
            const t = heldTransport<string>();
            const s = make(t);
            await settle();
            t.answer(0, 'kept');
            await settle();
            void s.refetch();
            await settle();
            const boom = new Error('refresh failed');
            t.fail(1, boom);
            await settle();
            expect(s.row(), 'a failed refresh looked like a refresh in progress')
                .toEqual({ state: 'error', pending: false, stale: true, data: 'kept', error: boom });
            void s.refetch();
            await settle();
            expect(s.row(), 'refreshing again after a failed refresh: the error stays until a success')
                .toEqual({ state: 'error', pending: true, stale: true, data: 'kept', error: boom });
            t.answer(2, 'fresh');
            await settle();
            expect(s.row(), 'a success did not clear the error and the staleness')
                .toEqual({ state: 'success', pending: false, stale: false, data: 'fresh', error: null });
            s.dispose();
        });

        it('a first load that fails is error with no data; its retry is pending', async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            const t = heldTransport<string>();
            const s = make(t, { retry: 1 });
            await vi.advanceTimersByTimeAsync(0);
            t.fail(0, new TypeError('network'));
            await vi.advanceTimersByTimeAsync(0);
            expect(s.row(), 'a failed first load waiting for its retry').toMatchObject({ state: 'pending', pending: true, stale: false, data: undefined });
            await vi.advanceTimersByTimeAsync(10_000);
            expect(t.calls.length, 'the retry never ran').toBe(2);
            const boom = new TypeError('still down');
            t.fail(1, boom);
            await vi.advanceTimersByTimeAsync(0);
            expect(s.row()).toEqual({ state: 'error', pending: false, stale: false, data: undefined, error: boom });
            s.dispose();
        });

        it('a value older than staleTime is stale, still success, and not refreshing on its own', async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
            const t = heldTransport<string>();
            const s = make(t, { staleTime: 1000 });
            await vi.advanceTimersByTimeAsync(0);
            t.answer(0, 'v');
            await vi.advanceTimersByTimeAsync(0);
            expect(s.row().stale, 'control: fresh right after it arrived').toBe(false);
            await vi.advanceTimersByTimeAsync(1001);
            expect(s.row(), 'staleTime passed and the value was not marked stale')
                .toEqual({ state: 'success', pending: false, stale: true, data: 'v', error: null });
            s.dispose();
        });

        it('acceptance case 5 (E5) — null, 0 and false are data: success, data() is that very value', async () => {
            for (const value of [null, 0, false] as unknown as string[]) {
                const t = heldTransport<string>();
                const s = make(t);
                await settle();
                t.answer(0, value);
                await settle();
                expect(s.row().state, `${String(value)} is not a result`).toBe('success');
                expect(s.row().data, `${String(value)} was taken for absence`).toBe(value);
                s.dispose();
            }
        });
    });
}

describe('the async vocabulary — resource() only', () => {
    it('an invalidated value is stale while its refresh runs, and fresh once it lands', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r = resource(() => t.call(), { key: 'ac-vocab-invalidate', cache, tags: ['users'] });
        await settle();
        t.answer(0, 'v1');
        await settle();
        cache.invalidate(['users']);
        await settle();
        expect([r.state(), r.pending(), r.stale(), r.data()], 'refreshing an invalidated value')
            .toEqual(['success', true, true, 'v1']);
        t.answer(1, 'v2');
        await settle();
        expect([r.state(), r.pending(), r.stale(), r.data()]).toEqual(['success', false, false, 'v2']);
        r.dispose();
    });

    it('the alpha names are gone: loading, isPending, status', () => {
        const r = resource(() => Promise.resolve(1), { key: 'ac-vocab-gone', cache: createCache({ gcInterval: 0 }) }) as unknown as Record<string, unknown>;
        expect([r.loading, r.isPending, r.status]).toEqual([undefined, undefined, undefined]);
        (r as unknown as { dispose(): void }).dispose();
    });

    it('resourceWhen renders the success branch for null, 0 and false, with that value', async () => {
        for (const value of [null, 0, false]) {
            const r = resource(() => Promise.resolve(value), { key: `ac-vocab-when-${String(value)}`, cache: createCache({ gcInterval: 0 }) });
            const host = document.createElement('div');
            host.appendChild(core.resourceWhen(r, {
                loading: () => document.createTextNode('loading'),
                success: (d) => document.createTextNode(`got:${JSON.stringify(d)}`),
            }));
            document.body.appendChild(host);
            await settle();
            expect(host.textContent, `${String(value)} did not render the success branch`).toBe(`got:${JSON.stringify(value)}`);
            r.dispose();
        }
    });

    it('E5 — resourceWhen renders the success branch for a fetcher that resolved undefined, and warns once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const r = resource(() => Promise.resolve(undefined), { key: 'ac-vocab-when-undefined', cache: createCache({ gcInterval: 0 }) });
        const host = document.createElement('div');
        host.appendChild(core.resourceWhen(r, {
            loading: () => document.createTextNode('loading'),
            success: (d) => document.createTextNode(`got:${String(d)}`),
        }));
        document.body.appendChild(host);
        await settle();
        expect(host.textContent, 'a success with no data rendered nothing').toBe('got:undefined');
        void r.refetch();
        await settle();
        expect(warn.mock.calls.filter((c) => String(c[0]).includes('resolved undefined')).length, 'the warning is once per resource').toBe(1);
        warn.mockRestore();
        r.dispose();
    });
});

describe('the async vocabulary — a compiled @fetch', () => {
    it('shows the same row as resource(): pending, then success', async () => {
        const t = heldTransport<Response>();
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => t.call(String(input))));
        core.setDefaultClient(core.createHttpClient({ retry: false, timeout: 0 }));
        // String(): an interpolation renders false and null as nothing.
        defineCompiled('acvocabfetch', "<template><p>{{ users.state() }}|{{ String(users.pending()) }}|{{ String(users.stale()) }}|{{ String(users.error()) }}</p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/ac-vocab' as string[];\n</script>\n");
        const el = document.createElement('app-acvocabfetch');
        document.body.appendChild(el);
        await settle();
        expect(el.querySelector('p')!.textContent).toBe('pending|true|false|null');
        t.answer(0, json(['ada']));
        await settle();
        expect(el.querySelector('p')!.textContent).toBe('success|false|false|null');
    });
});

describe('case 4 (E4), the template leg — @await over a compiled @fetch (#145)', () => {
    const src = (name: string) => "<template>\n"
        + "<button class=\"refresh\" @click=\"users.refetch()\">refresh</button>\n"
        + "@await (users as list) {\n"
        + "  <ul>@for (list as u; track u) { <li>{{ u }}</li> }</ul>\n"
        + "  @if (users.error()) { <p class=\"kept-error\">{{ users.error().message }}</p> }\n"
        + "} @loading { <p class=\"loading\">loading</p> } @error (err, retry) {\n"
        + "  <p class=\"error\">{{ err.message }}</p><button class=\"retry\" @click=\"retry()\">retry</button>\n"
        + "}\n</template>\n"
        + `<script setup>\n@fetch users: 'GET /api/ac-await-${name}' as string[];\n</script>\n`;

    it('@loading, then the body with the bound list; a refresh and a failed refresh keep the body', async () => {
        const t = heldTransport<Response>();
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => t.call(String(input))));
        core.setDefaultClient(core.createHttpClient({ retry: false, timeout: 0 }));
        defineCompiled('acawaitkeep', src('keep'));
        const el = document.createElement('app-acawaitkeep');
        document.body.appendChild(el);
        await settle();
        expect(el.querySelector('.loading'), 'no @loading while the first load is in flight').not.toBeNull();
        t.answer(0, json(['ada', 'bob']));
        await settle();
        expect([...el.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['ada', 'bob']);
        const list = el.querySelector('ul');
        el.querySelector<HTMLButtonElement>('.refresh')!.click();
        await settle();
        expect(el.querySelector('ul'), 'a refresh in flight replaced the body').toBe(list);
        t.fail(1, new TypeError('offline'));
        await settle();
        expect(el.querySelector('ul'), 'a failed refresh replaced the kept data').toBe(list);
        expect(el.querySelector('.error'), '@error rendered in place of the kept data').toBeNull();
        expect(el.querySelector('.kept-error')?.textContent, 'the body cannot read the failure beside the data').toBe('offline');
    });

    it('a first load that fails shows @error, and retry refetches', async () => {
        const t = heldTransport<Response>();
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => t.call(String(input))));
        core.setDefaultClient(core.createHttpClient({ retry: false, timeout: 0 }));
        defineCompiled('acawaiterr', src('err'));
        const el = document.createElement('app-acawaiterr');
        document.body.appendChild(el);
        await settle();
        t.fail(0, new TypeError('offline'));
        await settle();
        expect(el.querySelector('.error')?.textContent).toBe('offline');
        expect(el.querySelector('ul'), 'the body rendered with no data').toBeNull();
        el.querySelector<HTMLButtonElement>('.retry')!.click();
        await settle();
        expect(t.calls.length, 'retry did not refetch').toBe(2);
        expect(el.querySelector('.loading'), 'the retry in flight is not pending').not.toBeNull();
        t.answer(1, json(['ada']));
        await settle();
        expect([...el.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['ada']);
    });
});

describe('the async vocabulary — a mutation (no stale())', () => {
    it('idle, pending, success with its result; a failure keeps the last result and sets error()', async () => {
        let fail = false;
        const m = core.mutation({ fn: (n: number) => (fail ? Promise.reject(new Error('no')) : Promise.resolve(n * 2)) });
        expect([m.state(), m.pending(), m.data(), m.error()]).toEqual(['idle', false, undefined, null]);
        const run = m.execute(2);
        expect([m.state(), m.pending()]).toEqual(['pending', true]);
        await run;
        expect([m.state(), m.pending(), m.data(), m.error()]).toEqual(['success', false, 4, null]);
        fail = true;
        expect(await m.execute(3).catch((e: unknown) => e)).toBeInstanceOf(Error);
        expect([m.state(), m.pending(), m.data()]).toEqual(['error', false, 4]);
        expect((m.error() as Error).message).toBe('no');
        expect('stale' in m, 'a mutation has no stale()').toBe(false);
    });
});
