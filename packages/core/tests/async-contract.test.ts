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
    const tag = `pdx-async-contract-${++tagSeq}`;
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
        const tag = `pdx-async-contract-${++tagSeq}`;
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
        expect(r.state(), 'control: the first load is in flight').toBe('loading');
        const before = r.error();
        r.abort();
        expect(r.state(), 'cancelling left the source loading').toBe('idle');
        expect(r.loading(), 'a spinner bound to loading() never stops').toBe(false);
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
        expect(r.state(), 'control: the refresh is in flight').toBe('reloading');
        r.abort();
        expect(r.state(), 'cancelling a refresh left the source reloading').toBe('success');
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
        const el = document.createElement('pdx-acfetchlatest');
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
        const el = document.createElement('pdx-acfetchsignal');
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
        const el = document.createElement('pdx-acfetchdispose');
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
        const el = document.createElement('pdx-acfetchretry');
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
        document.body.appendChild(document.createElement('pdx-acretryfetch'));
        await vi.advanceTimersByTimeAsync(60_000);
        expect(seen.calls, 'the transport retried under the source\'s retries').toBe(3);
    });

    it('control — a read that fails twice then succeeds with retry: 2 is three calls', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const seen = scriptedFetch([503, 503]);
        core.setDefaultClient(core.createHttpClient({ timeout: 0 }));
        defineCompiled('acretryfetchok', "<template><p></p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/ac-retry-ok' as string[] { retry: 2 };\n</script>\n");
        document.body.appendChild(document.createElement('pdx-acretryfetchok'));
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
