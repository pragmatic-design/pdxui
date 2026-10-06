// Tests for createHttpClient — middleware chain, URL resolution, security.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHttpClient, getDefaultClient, configureClient } from '../src/http/client';
import type { HttpMiddleware } from '../src/http/types';
import { HttpError } from '../src/http/types';

// Mock fetch globally
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers: { 'content-type': 'application/json' },
    });
}

beforeEach(() => {
    mockFetch.mockReset();
    // Return a fresh Response for each call (Response body can only be read once)
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
});

describe('createHttpClient', () => {
    it('makes a GET request', async () => {
        const client = createHttpClient();
        const data = await client.get('/api/users');

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe('/api/users');
        expect(init?.method).toBe('GET');
        expect(data).toEqual({ ok: true });
    });

    it('makes a POST request with JSON body', async () => {
        const client = createHttpClient();
        await client.post('/api/users', { name: 'Alice' });

        const [, init] = mockFetch.mock.calls[0];
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe('{"name":"Alice"}');
        expect((init?.headers as Record<string, string>)?.['content-type']).toBe('application/json');
    });

    it('resolves baseUrl with relative path', async () => {
        const client = createHttpClient({ baseUrl: '/api' });
        await client.get('/users');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe('/api/users');
    });

    it('resolves baseUrl without leading slash', async () => {
        const client = createHttpClient({ baseUrl: '/api' });
        await client.get('users');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe('/api/users');
    });

    it('does not double-slash baseUrl', async () => {
        const client = createHttpClient({ baseUrl: '/api/' });
        await client.get('/users');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe('/api/users');
    });

    it('passes through absolute URLs', async () => {
        const client = createHttpClient({ baseUrl: '/api' });
        await client.get('https://external.com/data');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe('https://external.com/data');
    });

    it('merges static headers', async () => {
        const client = createHttpClient({ headers: { 'X-Custom': 'test' } });
        await client.get('/api/data');

        const [, init] = mockFetch.mock.calls[0];
        expect((init?.headers as Record<string, string>)?.['X-Custom']).toBe('test');
    });

    it('merges dynamic headers from headersFn', async () => {
        let token = 'abc';
        const client = createHttpClient({
            headers: { 'X-Static': 'static' },
            headersFn: () => ({ Authorization: `Bearer ${token}` }),
        });
        await client.get('/api/data');

        const [, init] = mockFetch.mock.calls[0];
        const headers = init?.headers as Record<string, string>;
        expect(headers?.['X-Static']).toBe('static');
        expect(headers?.Authorization).toBe('Bearer abc');
    });

    it('per-request headers override config headers', async () => {
        const client = createHttpClient({ headers: { 'X-Key': 'default' } });
        await client.get('/api/data', { headers: { 'X-Key': 'override' } });

        const [, init] = mockFetch.mock.calls[0];
        expect((init?.headers as Record<string, string>)?.['X-Key']).toBe('override');
    });

    it('throws HttpError on non-ok response', async () => {
        mockFetch.mockImplementationOnce(() => Promise.resolve(jsonResponse({ error: 'not found' }, 404)));
        const client = createHttpClient();

        try {
            await client.get('/api/missing');
            expect.unreachable('Should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(HttpError);
            expect((e as HttpError).status).toBe(404);
            // Security: message should NOT contain response body
            expect((e as HttpError).message).toBe('HTTP 404 Error');
        }
    });

    it('calls onError callback on error', async () => {
        mockFetch.mockImplementationOnce(() => Promise.resolve(jsonResponse({ error: 'fail' }, 500)));
        const onError = vi.fn();
        // `retry: false` pins this test to its own subject. With the default chain a GET that
        // fails once with a 500 is retried and succeeds, which is the point of the retry — but it
        // would leave this assertion measuring retry instead of the onError callback.
        const client = createHttpClient({ onError, retry: false });

        await expect(client.get('/fail')).rejects.toThrow();
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0][0]).toBeInstanceOf(HttpError);
    });

    it('calls onRequest and onResponse hooks', async () => {
        const onRequest = vi.fn();
        const onResponse = vi.fn();
        const client = createHttpClient({ onRequest, onResponse });

        await client.get('/api/data');

        expect(onRequest).toHaveBeenCalledOnce();
        expect(onRequest.mock.calls[0][0].method).toBe('GET');
        expect(onResponse).toHaveBeenCalledOnce();
        expect(onResponse.mock.calls[0][0].ok).toBe(true);
    });

    it('handles PUT, PATCH, DELETE methods', async () => {
        const client = createHttpClient();

        await client.put('/api/users/1', { name: 'Bob' });
        expect(mockFetch.mock.calls[0][1]?.method).toBe('PUT');

        await client.patch('/api/users/1', { name: 'Charlie' });
        expect(mockFetch.mock.calls[1][1]?.method).toBe('PATCH');

        await client.delete('/api/users/1');
        expect(mockFetch.mock.calls[2][1]?.method).toBe('DELETE');
    });
});

describe('URL security', () => {
    it('rejects javascript: protocol', async () => {
        const client = createHttpClient();
        await expect(client.get('javascript:alert(1)')).rejects.toThrow('Unsafe URL');
    });

    it('rejects data: protocol', async () => {
        const client = createHttpClient();
        await expect(client.get('data:text/html,<h1>hi</h1>')).rejects.toThrow('Unsafe URL');
    });

    it('rejects vbscript: protocol', async () => {
        const client = createHttpClient();
        await expect(client.get('vbscript:msgbox')).rejects.toThrow('Unsafe URL');
    });

    it('rejects protocol-relative URLs (token exfiltration)', async () => {
        const client = createHttpClient();
        await expect(client.get('//evil.com/steal')).rejects.toThrow('Unsafe URL');
    });

    it('rejects backslash-smuggled URLs', async () => {
        const client = createHttpClient();
        await expect(client.get('/\\evil.com')).rejects.toThrow('Unsafe URL');
    });

    it('allows legitimate relative URLs, queries and fragments', async () => {
        const client = createHttpClient();
        await expect(client.get('/api/x')).resolves.toBeDefined();
        await expect(client.get('?q=1')).resolves.toBeDefined();
        await expect(client.get('#frag')).resolves.toBeDefined();
    });
});

describe('JSON body security', () => {
    it('strips __proto__ from JSON body', async () => {
        const client = createHttpClient();
        // Build an object with __proto__ as an own property
        const malicious = Object.create(null);
        malicious.name = 'test';
        malicious.__proto__ = { isAdmin: true };
        await client.post('/api/data', malicious);

        const [, init] = mockFetch.mock.calls[0];
        const bodyStr = init?.body as string;
        // The serialized JSON should NOT contain __proto__
        expect(bodyStr).not.toContain('__proto__');
        expect(bodyStr).toContain('"name":"test"');
    });
});

describe('middleware chain', () => {
    it('executes middleware in order', async () => {
        const order: string[] = [];
        const mw1: HttpMiddleware = async (req, next) => {
            order.push('mw1-before');
            const res = await next(req);
            order.push('mw1-after');
            return res;
        };
        const mw2: HttpMiddleware = async (req, next) => {
            order.push('mw2-before');
            const res = await next(req);
            order.push('mw2-after');
            return res;
        };

        const client = createHttpClient({ middleware: [mw1, mw2] });
        await client.get('/api/data');

        expect(order).toEqual(['mw1-before', 'mw2-before', 'mw2-after', 'mw1-after']);
    });

    it('middleware can modify request', async () => {
        const addHeader: HttpMiddleware = async (req, next) => {
            return next({
                ...req,
                headers: { ...req.headers, 'X-Injected': 'yes' },
            });
        };

        const client = createHttpClient({ middleware: [addHeader] });
        await client.get('/api/data');

        const [, init] = mockFetch.mock.calls[0];
        expect((init?.headers as Record<string, string>)?.['X-Injected']).toBe('yes');
    });
});

describe('extend()', () => {
    it('creates derived client with merged config', async () => {
        const base = createHttpClient({ baseUrl: '/api', headers: { 'X-Base': 'yes' } });
        const extended = base.extend({ headers: { 'X-Extra': 'also' } });

        await extended.get('/users');

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe('/api/users');
        const headers = init?.headers as Record<string, string>;
        expect(headers?.['X-Base']).toBe('yes');
        expect(headers?.['X-Extra']).toBe('also');
    });
});

describe('default client', () => {
    it('configureClient sets and returns the default', async () => {
        const client = configureClient({ baseUrl: '/v2' });
        const def = getDefaultClient();

        expect(def).toBe(client);
    });
});
