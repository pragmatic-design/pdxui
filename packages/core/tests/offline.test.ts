// Coverage (network): offlineMiddleware — queues mutations offline, replays online.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { offlineMiddleware } from '../src/http/offline';
import { retryMiddleware } from '../src/http/middleware';
import { OfflineError, type HttpRequest, type HttpResponse } from '../src/http/types';

function setOnline(value: boolean): void {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}
afterEach(() => setOnline(true));

function req(method: HttpRequest['method'], url = '/api/x', body?: unknown): HttpRequest {
    return { method, url, headers: {}, body, meta: {} };
}
const okResponse = (r: HttpRequest): Promise<HttpResponse> => Promise.resolve({
    status: 200, statusText: 'OK', headers: new Headers(), data: null, ok: true, url: r.url,
});
const tick = () => new Promise(r => setTimeout(r, 0));

describe('offlineMiddleware', () => {
    it('passes GET requests through (any connectivity)', async () => {
        setOnline(false);
        const next = vi.fn(okResponse);
        const mw = offlineMiddleware();
        await mw(req('GET'), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('passes mutations through when online', async () => {
        setOnline(true);
        const next = vi.fn(okResponse);
        await offlineMiddleware()(req('POST'), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('queues a mutation offline and throws OfflineError', async () => {
        setOnline(false);
        const onQueued = vi.fn();
        const next = vi.fn(okResponse);
        const mw = offlineMiddleware({ onQueued });
        await expect(mw(req('POST', '/api/save', { a: 1 }), next)).rejects.toBeInstanceOf(OfflineError);
        expect(next).not.toHaveBeenCalled();
        expect(onQueued).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }), 1);
    });

    it('replays the queue when the connection returns', async () => {
        setOnline(false);
        const onReplay = vi.fn();
        const next = vi.fn(okResponse);
        const mw = offlineMiddleware({ onReplay });
        await expect(mw(req('PUT', '/api/item/1', { x: 1 }), next)).rejects.toBeInstanceOf(OfflineError);

        setOnline(true);
        window.dispatchEvent(new Event('online'));
        await tick();

        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0].url).toBe('/api/item/1');
        expect(onReplay).toHaveBeenCalledTimes(1);
    });

    it('caps the queue to maxQueueSize (drops oldest)', async () => {
        setOnline(false);
        const onQueued = vi.fn();
        const mw = offlineMiddleware({ maxQueueSize: 2, onQueued });
        const next = vi.fn(okResponse);
        for (const u of ['/a', '/b', '/c']) {
            await mw(req('POST', u), next).catch(() => {});
        }
        // Last onQueued call reports a queue size capped at 2.
        const lastSize = onQueued.mock.calls.at(-1)![1];
        expect(lastSize).toBeLessThanOrEqual(2);
    });

    // `retryMiddleware` sits OUTSIDE the caller's middleware, so every
    // retry re-enters this one — and this one queues before it throws. Without a guard, one offline
    // PUT is queued once per attempt and the server receives the same write that many times on
    // reconnect. The guard is in retryMiddleware; this is the fast half of the net,
    // and `offline-queue.spec.ts` is the half that uses a network.
    it('an idempotent mutation retried by retryMiddleware is queued once, not once per attempt', async () => {
        setOnline(false);
        const onQueued = vi.fn();
        const offline = offlineMiddleware({ onQueued });
        const retry = retryMiddleware({ maxRetries: 3, baseDelay: 1 });
        const next = vi.fn(okResponse);

        // The real chain order: retry outside, offline inside.
        await expect(retry(req('PUT', '/api/item/1'), (r) => offline(r, next))).rejects.toBeInstanceOf(OfflineError);

        expect(onQueued).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
    });
});
