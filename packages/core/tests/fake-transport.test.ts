// Coverage (5): fake-transport (instant) — also exercises array-transport CRUD.

import { describe, it, expect, beforeEach } from 'vitest';
import { fakeTransport, type FakeOperation } from '../src/data/fake-transport';

interface Row extends Record<string, unknown> { id?: number; name: string; }

describe('fakeTransport (latency 0)', () => {
    let ops: FakeOperation[];
    let t: ReturnType<typeof fakeTransport<Row>>;

    beforeEach(() => {
        ops = [];
        t = fakeTransport<Row>({
            data: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }],
            latency: 0,
            onOperation: (op) => ops.push(op),
        });
    });

    it('read returns all rows with total', async () => {
        const res = await t.read({ page: 1, pageSize: 10, sort: [], filter: [] });
        expect(res.data.length).toBe(2);
        expect(res.total).toBe(2);
        expect(ops.some(o => o.type === 'read')).toBe(true);
    });

    it('create adds a row', async () => {
        await t.create!({ name: 'c' });
        const all = await t.getData();
        expect(all.length).toBe(3);
        expect(all.some(r => r.name === 'c')).toBe(true);
        expect(ops.some(o => o.type === 'create')).toBe(true);
    });

    it('update replaces a row', async () => {
        await t.update!({ id: 1, name: 'A' });
        const all = await t.getData();
        expect(all.find(r => r.id === 1)?.name).toBe('A');
    });

    it('patch merges fields', async () => {
        await t.patch!(2, { name: 'B' });
        const all = await t.getData();
        expect(all.find(r => r.id === 2)?.name).toBe('B');
    });

    it('destroy removes a row', async () => {
        await t.destroy!({ id: 1, name: 'a' });
        const all = await t.getData();
        expect(all.find(r => r.id === 1)).toBeUndefined();
        expect(all.length).toBe(1);
    });

    it('batch applies added/updated/removed', async () => {
        await t.batch!({
            added: [{ name: 'c' }],
            updated: [{ id: 1, name: 'A' }],
            removed: [{ id: 2, name: 'b' }],
        });
        const all = await t.getData();
        expect(all.find(r => r.id === 1)?.name).toBe('A');
        expect(all.find(r => r.id === 2)).toBeUndefined();
        expect(all.some(r => r.name === 'c')).toBe(true);
        expect(ops.some(o => o.type === 'batch')).toBe(true);
    });

    it('simulates errors when errorRate is 1', async () => {
        const failing = fakeTransport<Row>({ data: [], latency: 0, errorRate: 1, errorMessage: 'boom' });
        await expect(failing.read({ page: 1, pageSize: 10, sort: [], filter: [] })).rejects.toThrow('boom');
    });

    // onOperation is the test surface — "what was asked" — and FakeOperation declares `request` and
    // `partial` for it. A log that fills `item` only leaves the recipe's `op.request.filter`
    // undefined: the one question the hook exists to answer. The tests above look only at `type`.
    it('reports the request a read received, filter included', async () => {
        const filter = [{ logic: 'or' as const, filters: [{ field: 'name', operator: 'eq' as const, value: 'a' }] }];
        await t.read({ page: 2, pageSize: 5, sort: [{ field: 'name', dir: 'asc' }], filter });
        const read = ops.find(o => o.type === 'read');
        expect(read?.request?.filter, 'the filter the screen sent').toEqual(filter);
        expect(read?.request).toMatchObject({ page: 2, pageSize: 5, sort: [{ field: 'name', dir: 'asc' }] });
    });

    it('reports the partial a patch received', async () => {
        await t.patch!(2, { name: 'B' });
        const patch = ops.find(o => o.type === 'patch');
        expect(patch?.partial).toEqual({ name: 'B' });
        expect(patch?.item, 'what it reported before stays where it was').toEqual({ id: 2, partial: { name: 'B' } });
    });
});
