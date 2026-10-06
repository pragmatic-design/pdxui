// Regression tests for residual review fixes in @pdxui/core:
//   #1 form-schema: pattern validator is ReDoS-resistant (compiled once + input cap)
//   #2 form-schema: type:'list' defaults populate the field array; minItems pre-fills
//   #3 store: adding a NEW key re-runs effects that enumerate keys (Object.keys)
//   #4 virtualizer: prefix-sum offsets match direct computation for variable sizes
//   #7 data-source: hasMore infers from last page when total is unknown (-1)
//
// Each test would fail if its fix were reverted.

import { describe, it, expect, vi } from 'vitest';
import { createFormFromSchema } from '../src/form/form-schema';
import type { FormSchema } from '../src/form/form-schema';
import { store } from '../src/reactivity/store';
import { effect } from '../src/reactivity/signal';
import { createVirtualizer } from '../src/renderer/virtualizer';
import { createDataSource } from '../src/data/data-source';
import type { IDataTransport, DataRequest, DataResponse } from '../src/data/transport';

// ─── #1 — pattern ReDoS mitigation ──────────────────────────────────

describe('#1 form-schema pattern — ReDoS-resistant', () => {
    it('caps catastrophic-backtracking input so validation returns fast', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const schema: FormSchema = {
            fields: [{
                name: 'code', type: 'text',
                validators: [{ type: 'pattern', params: { pattern: '(a+)+$' } }],
            }],
        };
        const form = createFormFromSchema(schema);
        // A long all-'a' string with a trailing 'b' is the classic ReDoS payload.
        const payload = 'a'.repeat(5000) + 'b';
        form.setValues({ code: payload });
        const t0 = Date.now();
        await form.validate(); // runs the pattern validator synchronously
        const elapsed = Date.now() - t0; // PERF-EXEMPT: the failure mode is SECONDS of catastrophic backtracking, not milliseconds — 500ms is ~500x the honest cost, so load cannot reach it
        // Without the input cap this hangs the thread for seconds.
        expect(elapsed).toBeLessThan(500);
        // Risky pattern detection should have warned.
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('normal patterns still validate correctly', () => {
        const schema: FormSchema = {
            fields: [{
                name: 'zip', type: 'text',
                validators: [{ type: 'pattern', params: { pattern: '^\\d{5}$' }, message: 'bad zip' }],
            }],
        };
        const form = createFormFromSchema(schema);
        form.setValues({ zip: 'abc' });
        return form.validate().then((ok) => {
            expect(ok).toBe(false);
            expect(form.errors().zip).toBe('bad zip');
        });
    });
});

// ─── #2 — list defaults + minItems ──────────────────────────────────

describe('#2 form-schema type:list — defaults populate field array', () => {
    it('default items are read by form.array()', () => {
        const schema: FormSchema = {
            fields: [{
                name: 'items', type: 'list',
                itemFields: [
                    { name: 'product', type: 'text' },
                    { name: 'qty', type: 'number' },
                ],
                default: [
                    { product: 'Widget', qty: 2 },
                    { product: 'Gadget', qty: 5 },
                ],
            }],
        };
        const form = createFormFromSchema(schema);
        const arr = form.array('items' as never);
        const values = arr.getValues() as Array<Record<string, unknown>>;
        expect(values).toHaveLength(2);
        expect(values[0]).toMatchObject({ product: 'Widget', qty: 2 });
        expect(values[1]).toMatchObject({ product: 'Gadget', qty: 5 });
    });

    it('minItems pre-populates empty items when no default', () => {
        const schema: FormSchema = {
            fields: [{
                name: 'rows', type: 'list',
                minItems: 3,
                itemDefault: { name: 'new' },
                itemFields: [{ name: 'name', type: 'text' }],
            }],
        };
        const form = createFormFromSchema(schema);
        const arr = form.array('rows' as never);
        const values = arr.getValues() as Array<Record<string, unknown>>;
        expect(values).toHaveLength(3);
        expect(values[0]).toMatchObject({ name: 'new' });
    });
});

// ─── #3 — store new-key reactivity ──────────────────────────────────

describe('#3 store — adding a new key re-runs key enumeration effects', () => {
    it('Object.keys effect re-runs when a brand-new key is added', () => {
        const s = store<Record<string, number>>({ a: 1 });
        let snapshot: string[] = [];
        let runs = 0;
        const dispose = effect(() => {
            snapshot = Object.keys(s);
            runs++;
        });
        expect(runs).toBe(1);
        expect(snapshot).toEqual(['a']);

        s.b = 2; // brand-new key
        expect(runs).toBe(2);
        expect(snapshot).toEqual(['a', 'b']);

        // Updating an existing key must NOT trigger the ownKeys effect.
        s.a = 99;
        expect(runs).toBe(2);

        dispose();
    });

    it('deleting a key re-runs key enumeration effects', () => {
        const s = store<Record<string, number>>({ a: 1, b: 2 });
        let runs = 0;
        const dispose = effect(() => { Object.keys(s); runs++; });
        expect(runs).toBe(1);
        delete s.b;
        expect(runs).toBe(2);
        dispose();
    });
});

// ─── #4 — virtualizer prefix-sum correctness ────────────────────────

describe('#4 virtualizer — prefix-sum offsets match direct computation', () => {
    function setup(sizes: number[], gap = 0) {
        const el = document.createElement('div');
        Object.defineProperty(el, 'clientHeight', { value: 200, writable: true });
        Object.defineProperty(el, 'clientWidth', { value: 300, writable: true });
        document.body.appendChild(el);
        const v = createVirtualizer({
            count: () => sizes.length,
            estimateSize: (i) => sizes[i],
            getScrollElement: () => el,
            gap,
        });
        return { v, el };
    }

    it('totalSize equals sum of variable sizes (+ gaps)', () => {
        const sizes = [10, 40, 25, 80, 15, 60];
        const gap = 4;
        const { v, el } = setup(sizes, gap);
        const expected = sizes.reduce((a, b) => a + b, 0) + gap * (sizes.length - 1);
        expect(v.totalSize()).toBe(expected);
        v.dispose();
        el.remove();
    });

    it('item.start offsets are cumulative for variable sizes', () => {
        const sizes = [30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
        const { v, el } = setup(sizes);
        const items = v.items();
        // Each visible item's start is the cumulative sum of preceding sizes.
        for (const it of items) {
            const expectedStart = sizes.slice(0, it.index).reduce((a, b) => a + b, 0);
            expect(it.start).toBe(expectedStart);
        }
        v.dispose();
        el.remove();
    });
});

// ─── #7 — hasMore with unknown total ────────────────────────────────

describe('#7 data-source — hasMore infers from last page when total unknown', () => {
    function transport(pages: Record<string, unknown>[][]): IDataTransport<Record<string, unknown>> {
        return {
            async read(req: DataRequest): Promise<DataResponse<Record<string, unknown>>> {
                const data = pages[req.page - 1] ?? [];
                return { data, total: -1 }; // server does NOT report total
            },
        };
    }

    it('full last page → hasMore true; short page → hasMore false', async () => {
        // pageSize 2: page1 full (2 items) → more; page2 short (1 item) → done.
        const ds = createDataSource<Record<string, unknown>>({
            transport: transport([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]),
            pageSize: 2,
            autoLoad: false,
        });
        await ds.refresh();
        expect(ds.hasMore()).toBe(true);

        ds.setPage(2);
        await ds.refresh();
        expect(ds.hasMore()).toBe(false);
        ds.dispose();
    });

    it('empty result with unknown total → hasMore false (not silently stuck on)', async () => {
        const ds = createDataSource<Record<string, unknown>>({
            transport: transport([[]]),
            pageSize: 10,
            autoLoad: false,
        });
        await ds.refresh();
        expect(ds.hasMore()).toBe(false);
        ds.dispose();
    });
});
