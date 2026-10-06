// What an application gets from `createHttpClient()` with no configuration at all.
//
// The pipeline was `buildChain(config.middleware ?? [], baseFetcher)` and `config.timeout ?? 0`,
// so every `@fetch` in every PDX app ran with no timeout and no retry: a request that never
// answered never settled, `loading` stayed true and no `error` was ever produced.
//
// The mechanisms existed — `config.timeout` is read by the base fetcher and `retryMiddleware`
// already defaults to idempotent methods only. What was missing were the defaults.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttpClient } from '../src/http/client';
import { HttpError } from '../src/http/types';

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that never settles until the caller's signal aborts. */
function hangingFetch(): typeof fetch {
    return ((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
    })) as unknown as typeof fetch;
}

beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('http client defaults', () => {
    it('a request that never answers fails at the default timeout instead of pending forever', async () => {
        mockFetch.mockImplementation(hangingFetch());
        const client = createHttpClient();

        const promise = client.get('/api/slow');
        const settled = vi.fn();
        promise.then(settled, settled);

        // The deadline is scheduled several async hops in (chain -> retry -> base fetcher), so let
        // the request reach the fetch before advancing, or the timer does not exist yet to fire.
        await vi.advanceTimersByTimeAsync(0);
        // Well past any sane deadline, but before the assertion below runs.
        await vi.advanceTimersByTimeAsync(60_000);
        expect(settled, 'the request never settled').toHaveBeenCalled();
        await expect(promise).rejects.toThrow();
    });

    it('timeout: 0 still means no timeout — the opt-out is real', async () => {
        mockFetch.mockImplementation(hangingFetch());
        const client = createHttpClient({ timeout: 0 });

        const settled = vi.fn();
        client.get('/api/slow').then(settled, settled);

        await vi.advanceTimersByTimeAsync(120_000);
        expect(settled, 'timeout: 0 did not disable the deadline').not.toHaveBeenCalled();
    });

    it('retries an idempotent request that fails, then succeeds', async () => {
        let calls = 0;
        mockFetch.mockImplementation(() => {
            calls++;
            if (calls < 3) return Promise.resolve(jsonResponse({ error: 'nope' }, 503));
            return Promise.resolve(jsonResponse({ ok: true }));
        });

        const promise = createHttpClient().get('/api/flaky');
        await vi.advanceTimersByTimeAsync(20_000); // let the backoff delays elapse
        await expect(promise).resolves.toEqual({ ok: true });
        expect(calls, 'a failing GET was not retried').toBe(3);
    });

    it('never retries a POST — replaying a write is not safe', async () => {
        let calls = 0;
        mockFetch.mockImplementation(() => {
            calls++;
            return Promise.resolve(jsonResponse({ error: 'nope' }, 503));
        });

        const promise = createHttpClient().post('/api/orders', { id: 1 });
        const caught = promise.catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(20_000);
        expect(await caught).toBeInstanceOf(HttpError);
        expect(calls, 'a POST was replayed').toBe(1);
    });

    it('retry: false disables it — the opt-out is real', async () => {
        let calls = 0;
        mockFetch.mockImplementation(() => {
            calls++;
            return Promise.resolve(jsonResponse({ error: 'nope' }, 503));
        });

        const promise = createHttpClient({ retry: false }).get('/api/flaky');
        const caught = promise.catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(20_000);
        expect(await caught).toBeInstanceOf(HttpError);
        expect(calls, 'retry: false did not disable retrying').toBe(1);
    });

    it('a request killed by its own deadline is attempted once, not replayed', async () => {
        // Found by turning the defaults on: `retryMiddleware` tested `err instanceof DOMException`,
        // but the client converts fetch's abort into its own `AbortError` (which extends Error)
        // before any middleware sees it. The check never fired, so a hanging endpoint was retried
        // four times and took four deadlines to fail instead of one.
        let attempts = 0;
        mockFetch.mockImplementation(((_url: string, init?: RequestInit) => {
            attempts++;
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    reject(new DOMException('The operation was aborted.', 'AbortError'));
                });
            });
        }) as unknown as typeof fetch);

        const promise = createHttpClient().get('/api/dead');
        const caught = promise.catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(120_000);

        await expect(caught).resolves.toBeInstanceOf(Error);
        expect(attempts, 'an aborted request was replayed').toBe(1);
    });

    it('a caller-supplied middleware still runs, alongside the defaults', async () => {
        mockFetch.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
        const seen: string[] = [];
        const client = createHttpClient({
            middleware: [async (req, next) => { seen.push(req.url); return next(req); }],
        });

        await client.get('/api/users');
        expect(seen, 'the configured middleware was dropped').toEqual([expect.stringContaining('/api/users')]);
    });
});
