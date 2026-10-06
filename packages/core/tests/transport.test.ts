// Coverage (network): restTransport with an injected fetch mock.

import { describe, it, expect, vi } from 'vitest';
import { restTransport } from '../src/data/transport';

interface Row extends Record<string, unknown> { id: number; name: string; }

function res(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
    return Promise.resolve({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        statusText: init.statusText ?? 'OK',
        json: async () => body,
    } as Response);
}

describe('restTransport', () => {
    it('read builds query params and parses { data, total }', async () => {
        const fetchFn = vi.fn((_url: RequestInfo | URL, _opts?: RequestInit) => res({ data: [{ id: 1, name: 'a' }], total: 42 }));
        const t = restTransport<Row>({ baseUrl: '/api/users', fetchFn });
        const r = await t.read({ page: 2, pageSize: 25, sort: [{ field: 'name', dir: 'asc' }], filter: [{ field: 'name', operator: 'contains', value: 'a' }] });
        expect(r.data).toEqual([{ id: 1, name: 'a' }]);
        expect(r.total).toBe(42);
        const url = fetchFn.mock.calls[0][0] as string;
        expect(url).toContain('page=2');
        expect(url).toContain('pageSize=25');
        expect(url).toContain('sort=');
        expect(url).toContain('filter=');
    });

    it('read parses a plain array (total -1) and {items}/{count}', async () => {
        const tArr = restTransport<Row>({ baseUrl: '/api', fetchFn: vi.fn((_url: RequestInfo | URL, _opts?: RequestInit) => res([{ id: 1, name: 'a' }])) });
        expect((await tArr.read(req())).total).toBe(-1);
        const tItems = restTransport<Row>({ baseUrl: '/api', fetchFn: vi.fn((_url: RequestInfo | URL, _opts?: RequestInit) => res({ items: [{ id: 1, name: 'a' }], count: 7 })) });
        const r = await tItems.read(req());
        expect(r.data.length).toBe(1);
        expect(r.total).toBe(7);
    });

    it('read throws on non-ok response', async () => {
        const t = restTransport<Row>({ baseUrl: '/api', fetchFn: vi.fn((_url: RequestInfo | URL, _opts?: RequestInit) => res(null, { ok: false, status: 500, statusText: 'Server Error' })) });
        await expect(t.read(req())).rejects.toThrow('HTTP 500');
    });

    it('create POSTs the item', async () => {
        const fetchFn = vi.fn((_url: RequestInfo | URL, _opts?: RequestInit) => res({ id: 9, name: 'new' }));
        const t = restTransport<Row>({ baseUrl: '/api/users', fetchFn });
        const created = await t.create!({ name: 'new' });
        expect(created).toEqual({ id: 9, name: 'new' });
        const [, opts] = fetchFn.mock.calls[0];
        expect(opts!.method).toBe('POST');
        expect(JSON.parse(opts!.body as string)).toEqual({ name: 'new' });
    });

    it('update PUTs to /:id', async () => {
        const fetchFn = vi.fn((_url: RequestInfo | URL, _opts?: RequestInit) => res({ id: 1, name: 'A' }));
        const t = restTransport<Row>({ baseUrl: '/api/users', fetchFn });
        await t.update!({ id: 1, name: 'A' });
        expect(fetchFn.mock.calls[0][0]).toBe('/api/users/1');
        expect((fetchFn.mock.calls[0][1] as RequestInit).method).toBe('PUT');
    });

    it('patch PATCHes and destroy DELETEs /:id', async () => {
        const fp = vi.fn((_url: RequestInfo | URL, _opts?: RequestInit) => res({ id: 1, name: 'P' }));
        await restTransport<Row>({ baseUrl: '/api/users', fetchFn: fp }).patch!(1, { name: 'P' });
        expect((fp.mock.calls[0][1] as RequestInit).method).toBe('PATCH');

        const fd = vi.fn((_url: RequestInfo | URL, _opts?: RequestInit) => res(null));
        await restTransport<Row>({ baseUrl: '/api/users', fetchFn: fd }).destroy!({ id: 1, name: 'x' });
        expect(fd.mock.calls[0][0]).toBe('/api/users/1');
        expect((fd.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
    });

    it('batch runs added/updated/removed and returns results', async () => {
        const fetchFn = vi.fn((_url: RequestInfo | URL, opts?: RequestInit) => {
            if (opts?.method === 'POST') return res({ id: 99, name: 'c' });
            return res({ id: 1, name: 'u' });
        });
        const t = restTransport<Row>({ baseUrl: '/api/users', fetchFn });
        const out = await t.batch!({ added: [{ name: 'c' } as Row], updated: [{ id: 1, name: 'u' }], removed: [{ id: 2, name: 'd' }] });
        expect(out.added.length).toBe(1);
        expect(out.updated.length).toBe(1);
        expect(out.removed.length).toBe(1);
    });

    it('honors headers (function), custom parameterMap and parseResponse', async () => {
        const fetchFn = vi.fn((_url: RequestInfo | URL, _opts?: RequestInit) => res({ rows: [{ id: 1, name: 'a' }] }));
        const t = restTransport<Row>({
            baseUrl: '/api',
            fetchFn,
            headers: () => ({ Authorization: 'Bearer x' }),
            parameterMap: () => ({ q: 'custom' }),
            parseResponse: (j) => ({ data: (j as { rows: Row[] }).rows, total: 1 }),
        });
        const r = await t.read(req());
        expect(r.total).toBe(1);
        expect(fetchFn.mock.calls[0][0]).toContain('q=custom');
        expect((fetchFn.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer x' });
    });
});

function req(): Parameters<ReturnType<typeof restTransport>['read']>[0] {
    return { page: 1, pageSize: 10, sort: [], filter: [] };
}
