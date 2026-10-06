// Regression tests for http / data / form review fixes:
//   - httpResourceKey: body/headers participate in the cache key (no cross-body poisoning)
//   - resolveUrl: rejects unsafe URLs (//evil.com, javascript:) with "Unsafe URL"
//   - createForm.handleSubmit: double-submit guard set before the async validation await
//   - arrayTransport.read: empty/absent filter returns all items; a real filter applies
//
// All pass with the fixes in place; each would fail if its fix were reverted.

import { describe, it, expect } from 'vitest';
import { httpResourceKey } from '../src/reactivity/http-resource';
import { resolveUrl } from '../src/http/client';
import { createForm } from '../src/form/form';
import { arrayTransport } from '../src/data/array-transport';
import type { DataRequest } from '../src/data/transport';

describe('httpResourceKey — body is part of the cache key', () => {
    it('same method+URL with different bodies → different keys', () => {
        const k1 = httpResourceKey('POST', '/api/search', { q: 'a' });
        const k2 = httpResourceKey('POST', '/api/search', { q: 'b' });
        expect(k1).not.toBe(k2);
    });

    it('equal requests (key order-independent) → equal keys', () => {
        const k1 = httpResourceKey('POST', '/api/search', { a: 1, b: 2 });
        const k2 = httpResourceKey('POST', '/api/search', { b: 2, a: 1 });
        expect(k1).toBe(k2);
    });

    it('different headers → different keys', () => {
        const k1 = httpResourceKey('GET', '/api/x', undefined, { Authorization: 'A' });
        const k2 = httpResourceKey('GET', '/api/x', undefined, { Authorization: 'B' });
        expect(k1).not.toBe(k2);
    });
});

describe('resolveUrl — rejects unsafe URLs', () => {
    it('throws "Unsafe URL" for a protocol-relative path', () => {
        expect(() => resolveUrl(undefined, '//evil.com')).toThrow(/Unsafe URL/);
    });

    it('throws "Unsafe URL" for a javascript: path', () => {
        expect(() => resolveUrl('https://api.example.com', 'javascript:alert(1)')).toThrow(/Unsafe URL/);
    });

    it('passes a safe relative path joined to baseUrl', () => {
        expect(resolveUrl('https://api.example.com', '/users')).toBe('https://api.example.com/users');
    });

    it('passes a safe absolute https URL untouched', () => {
        expect(resolveUrl(undefined, 'https://api.example.com/x')).toBe('https://api.example.com/x');
    });
});

describe('createForm.handleSubmit — double-submit guard during async validation', () => {
    it('two concurrent submits invoke the submit handler exactly once', async () => {
        let submitCount = 0;
        let resolveValidation!: (msg: string | undefined) => void;

        const form = createForm<{ name: string }>({
            initialValues: { name: 'Jane' },
            asyncValidators: {
                // Pending until we resolve it — keeps validateAll() awaiting while both
                // submit calls race the isSubmitting guard.
                name: () => new Promise<string | undefined>((res) => { resolveValidation = res; }),
            },
        });

        const submit = form.handleSubmit(async () => { submitCount++; });

        const evt = () => ({ preventDefault() {} } as unknown as Event);

        // Fire two submits "concurrently". The first flips isSubmitting=true synchronously
        // (before awaiting validateAll); the second must early-return.
        const p1 = submit(evt());
        const p2 = submit(evt());

        // Let the validation pass.
        resolveValidation(undefined);
        await p1; await p2;
        // Give any trailing microtasks a chance.
        await Promise.resolve();

        expect(submitCount).toBe(1);
        form.dispose();
    });
});

describe('arrayTransport.read — filter handling', () => {
    const data = [
        { id: 1, name: 'Ann', age: 30 },
        { id: 2, name: 'Bob', age: 40 },
        { id: 3, name: 'Cara', age: 50 },
    ];

    function req(overrides: Partial<DataRequest>): DataRequest {
        return { page: 1, pageSize: 0, sort: [], filter: [], ...overrides };
    }

    it('returns all items when filter is empty', async () => {
        const t = arrayTransport({ data });
        const res = await t.read(req({ filter: [] }));
        expect(res.data).toHaveLength(3);
        expect(res.total).toBe(3);
    });

    it('returns all items when filter is absent', async () => {
        const t = arrayTransport({ data });
        // filter intentionally omitted via cast to exercise the `request.filter && …` guard.
        const res = await t.read(req({ filter: undefined as unknown as [] }));
        expect(res.data).toHaveLength(3);
        expect(res.total).toBe(3);
    });

    it('applies a real filter', async () => {
        const t = arrayTransport({ data });
        const res = await t.read(req({
            filter: [{ field: 'age', operator: 'gt', value: 35 }],
        }));
        expect(res.data.map(d => d.id).sort()).toEqual([2, 3]);
        expect(res.total).toBe(2);
    });
});
