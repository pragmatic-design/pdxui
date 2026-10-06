// Tests for built-in HTTP middleware.

import { describe, it, expect, vi } from 'vitest';
import { authMiddleware, retryMiddleware, logMiddleware, csrfMiddleware } from '../src/http/middleware';
import type { HttpRequest, HttpResponse, HttpHandler } from '../src/http/types';
import { HttpError } from '../src/http/types';

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
    return {
        method: 'GET',
        url: '/api/test',
        headers: {},
        meta: Object.freeze({}),
        ...overrides,
    };
}

function makeResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
    return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: { ok: true },
        ok: true,
        url: '/api/test',
        ...overrides,
    };
}

describe('authMiddleware', () => {
    it('adds Authorization header when token available', async () => {
        const mw = authMiddleware({ getToken: () => 'my-token' });
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());

        await mw(makeRequest(), next);

        expect(next.mock.calls[0][0].headers.Authorization).toBe('Bearer my-token');
    });

    it('skips auth when token is null', async () => {
        const mw = authMiddleware({ getToken: () => null });
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());

        await mw(makeRequest(), next);

        expect(next.mock.calls[0][0].headers.Authorization).toBeUndefined();
    });

    it('respects skipAuth meta', async () => {
        const mw = authMiddleware({ getToken: () => 'token' });
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());
        const req = makeRequest({ meta: Object.freeze({ skipAuth: true }) });

        await mw(req, next);

        expect(next.mock.calls[0][0].headers.Authorization).toBeUndefined();
    });

    it('uses custom header name and prefix', async () => {
        const mw = authMiddleware({
            getToken: () => 'key123',
            header: 'X-API-Key',
            prefix: '',
        });
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());

        await mw(makeRequest(), next);

        expect(next.mock.calls[0][0].headers['X-API-Key']).toBe('key123');
    });

    it('supports async getToken', async () => {
        const mw = authMiddleware({ getToken: async () => 'async-token' });
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());

        await mw(makeRequest(), next);

        expect(next.mock.calls[0][0].headers.Authorization).toBe('Bearer async-token');
    });
});

describe('retryMiddleware', () => {
    it('retries on 500 error', async () => {
        const mw = retryMiddleware({ maxRetries: 2, baseDelay: 1 });
        let attempt = 0;
        const next: HttpHandler = async () => {
            attempt++;
            if (attempt < 3) throw new HttpError(500, 'Internal Server Error', '/api/test');
            return makeResponse();
        };

        const result = await mw(makeRequest(), next);

        expect(attempt).toBe(3);
        expect(result.ok).toBe(true);
    });

    it('does NOT retry on 404 (client error)', async () => {
        const mw = retryMiddleware({ maxRetries: 3, baseDelay: 1 });
        let attempt = 0;
        const next: HttpHandler = async () => {
            attempt++;
            throw new HttpError(404, 'Not Found', '/api/test');
        };

        await expect(mw(makeRequest(), next)).rejects.toThrow(HttpError);
        expect(attempt).toBe(1); // No retry
    });

    it('retries on 429 (rate limit)', async () => {
        const mw = retryMiddleware({ maxRetries: 1, baseDelay: 1 });
        let attempt = 0;
        const next: HttpHandler = async () => {
            attempt++;
            if (attempt === 1) throw new HttpError(429, 'Too Many Requests', '/api/test');
            return makeResponse();
        };

        const result = await mw(makeRequest(), next);
        expect(attempt).toBe(2);
        expect(result.ok).toBe(true);
    });

    it('does NOT retry non-idempotent methods by default', async () => {
        const mw = retryMiddleware({ maxRetries: 3, baseDelay: 1 });
        let attempt = 0;
        const next: HttpHandler = async () => {
            attempt++;
            throw new HttpError(500, 'Error', '/api/test');
        };

        const req = makeRequest({ method: 'POST' });
        await expect(mw(req, next)).rejects.toThrow();
        expect(attempt).toBe(1);
    });

    it('retries POST when idempotentOnly=false', async () => {
        const mw = retryMiddleware({ maxRetries: 1, baseDelay: 1, idempotentOnly: false });
        let attempt = 0;
        const next: HttpHandler = async () => {
            attempt++;
            if (attempt === 1) throw new HttpError(500, 'Error', '/api/test');
            return makeResponse();
        };

        const req = makeRequest({ method: 'POST' });
        await mw(req, next);
        expect(attempt).toBe(2);
    });

    it('throws after exhausting retries', async () => {
        const mw = retryMiddleware({ maxRetries: 2, baseDelay: 1 });
        let attempt = 0;
        const next: HttpHandler = async () => {
            attempt++;
            throw new HttpError(503, 'Unavailable', '/api/test');
        };

        await expect(mw(makeRequest(), next)).rejects.toThrow(HttpError);
        expect(attempt).toBe(3); // initial + 2 retries
    });
});

describe('logMiddleware', () => {
    it('logs request and response', async () => {
        const log = vi.fn();
        const mw = logMiddleware({ logger: { log } });
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());

        await mw(makeRequest(), next);

        expect(log).toHaveBeenCalledTimes(2);
        expect(log.mock.calls[0][0]).toContain('[HTTP] GET /api/test');
        expect(log.mock.calls[1][0]).toContain('[HTTP] 200 GET /api/test');
    });

    it('redacts Authorization header in logs', async () => {
        const log = vi.fn();
        const mw = logMiddleware({ logger: { log } });
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());
        const req = makeRequest({ headers: { Authorization: 'Bearer secret-token-123' } });

        await mw(req, next);

        // The logged headers should have [REDACTED], not the actual token
        const loggedHeaders = log.mock.calls[0][1];
        expect(loggedHeaders.Authorization).toBe('[REDACTED]');
    });

    it('respects filter option', async () => {
        const log = vi.fn();
        const mw = logMiddleware({
            logger: { log },
            filter: (req) => !req.url.includes('health'),
        });
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());

        await mw(makeRequest({ url: '/health' }), next);
        expect(log).not.toHaveBeenCalled();

        await mw(makeRequest({ url: '/api/data' }), next);
        expect(log).toHaveBeenCalled();
    });
});

describe('csrfMiddleware', () => {
    it('skips CSRF for GET requests', async () => {
        const mw = csrfMiddleware();
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());

        await mw(makeRequest({ method: 'GET' }), next);

        expect(next.mock.calls[0][0].headers['X-XSRF-TOKEN']).toBeUndefined();
    });

    it('adds CSRF token for POST requests', async () => {
        // Mock document.cookie
        Object.defineProperty(document, 'cookie', {
            value: 'XSRF-TOKEN=abc123; other=value',
            writable: true,
            configurable: true,
        });

        const mw = csrfMiddleware();
        const next = vi.fn<HttpHandler>().mockResolvedValue(makeResponse());

        await mw(makeRequest({ method: 'POST' }), next);

        expect(next.mock.calls[0][0].headers['X-XSRF-TOKEN']).toBe('abc123');
    });
});
