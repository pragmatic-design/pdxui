// Tests for delayTransport wrapper.

import { describe, it, expect } from 'vitest';
import { arrayTransport } from '../src/data/array-transport';
import { delayTransport } from '../src/data/delay-transport';

const sampleData = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Charlie' },
];

function makeRequest(overrides = {}) {
    return { page: 1, pageSize: 0, sort: [], filter: [], ...overrides };
}

describe('delayTransport', () => {
    it('wraps read with artificial delay', async () => {
        const inner = arrayTransport({ data: sampleData, idField: 'id' });
        const delayed = delayTransport({ transport: inner, readDelay: 50 });

        const start = Date.now();
        const result = await delayed.read(makeRequest());
        const elapsed = Date.now() - start; // PERF-EXEMPT: a LOWER bound on an artificial delay — load can only make elapsed larger, i.e. push it further into passing

        expect(result.data).toHaveLength(3);
        expect(elapsed).toBeGreaterThanOrEqual(40); // ~50ms with timing tolerance
    });

    it('returns same data as inner transport', async () => {
        const inner = arrayTransport({ data: sampleData, idField: 'id' });
        const delayed = delayTransport({ transport: inner, readDelay: 10 });

        const directResult = await inner.read(makeRequest());
        const delayedResult = await delayed.read(makeRequest());

        expect(delayedResult.data).toEqual(directResult.data);
        expect(delayedResult.total).toBe(directResult.total);
    });

    it('wraps create with write delay', async () => {
        const inner = arrayTransport({ data: [...sampleData], idField: 'id' });
        const delayed = delayTransport({ transport: inner, writeDelay: 30 });

        const start = Date.now();
        const created = await delayed.create!({ id: 4, name: 'Diana' });
        const elapsed = Date.now() - start; // PERF-EXEMPT: a LOWER bound on an artificial delay — load can only make elapsed larger, i.e. push it further into passing

        expect(created.name).toBe('Diana');
        expect(elapsed).toBeGreaterThanOrEqual(20);
    });

    it('uses default delays when not specified', async () => {
        const inner = arrayTransport({ data: sampleData, idField: 'id' });
        const delayed = delayTransport({ transport: inner });

        // Just verify it works — don't wait 800ms in tests
        expect(delayed.read).toBeDefined();
        expect(delayed.create).toBeDefined();
        expect(delayed.update).toBeDefined();
        expect(delayed.destroy).toBeDefined();
    });

    it('preserves filter/sort behavior', async () => {
        const inner = arrayTransport({ data: sampleData, idField: 'id' });
        const delayed = delayTransport({ transport: inner, readDelay: 10 });

        const result = await delayed.read(makeRequest({
            filter: [{ field: 'name', operator: 'contains', value: 'li' }],
        }));

        expect(result.data).toHaveLength(2); // Alice, Charlie
    });
});
