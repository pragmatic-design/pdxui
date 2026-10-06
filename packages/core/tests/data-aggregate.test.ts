// BUG 5 — aggregateColumn: single source of truth for column aggregates (footer summary +
// per-group aggregates). Covers every enum form, the custom-function form, and the avg↔average alias.

import { describe, it, expect } from 'vitest';
import { aggregateColumn, clientGroup } from '../src/data/data-utils';

describe('aggregateColumn', () => {
    const nums = [1, 2, 3];

    it('sum', () => expect(aggregateColumn(nums, 'sum')).toBe(6));
    it('avg', () => expect(aggregateColumn(nums, 'avg')).toBe(2));
    it('count includes nulls', () => expect(aggregateColumn([1, null, 3], 'count')).toBe(3));
    it('min', () => expect(aggregateColumn(nums, 'min')).toBe(1));
    it('max', () => expect(aggregateColumn(nums, 'max')).toBe(3));

    it('normalizes the "average" alias to avg', () => {
        expect(aggregateColumn(nums, 'average')).toBe(2);
    });

    it('numeric aggregates ignore null / non-numeric values', () => {
        expect(aggregateColumn([1, null, undefined, 3], 'sum')).toBe(4);
        expect(aggregateColumn([], 'avg')).toBe(0);
        expect(aggregateColumn([], 'min')).toBe(0);
    });

    it('custom function form receives the raw values', () => {
        const spec = (vals: unknown[]) => (vals as number[]).map(v => v * 2).join(',');
        expect(aggregateColumn(nums, spec)).toBe('2,4,6');
    });
});

describe('clientGroup uses the same aggregation base (no avg/average mismatch)', () => {
    it('computes an "average" aggregate per group', () => {
        const items = [
            { cat: 'a', n: 10 },
            { cat: 'a', n: 20 },
            { cat: 'b', n: 4 },
        ];
        const groups = clientGroup(items, [{ field: 'cat', aggregates: [{ field: 'n', aggregate: 'average' }] }]);
        const a = groups.find(g => g.value === 'a')!;
        const b = groups.find(g => g.value === 'b')!;
        expect(a.aggregates!['n_average']).toBe(15);
        expect(b.aggregates!['n_average']).toBe(4);
    });
});
