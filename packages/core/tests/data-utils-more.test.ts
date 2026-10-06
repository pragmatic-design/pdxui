// Client-side filter, sort, group, aggregate and diff.
//
// Pure functions, and the ones a data grid is actually made of. The interesting cases are the ones
// a happy-path test never reaches: null ordering, a `between` with one open bound, an `in` filter
// whose UI values arrive as strings against numeric data, and what an average of nothing is.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    matchesFilter, matchesFilters, matchesCompositeFilter, clientSort, clientGroup,
    aggregateColumn, computeDiff,
} from '../src/data/data-utils';
import type { FilterDescriptor } from '../src/data/transport';

const row = (over: Record<string, unknown> = {}) =>
    ({ id: 1, name: 'Alpha', qty: 10, tag: null, ...over });

const f = (field: string, operator: string, value?: unknown) =>
    ({ field, operator, value }) as FilterDescriptor;

afterEach(() => { vi.useRealTimers(); });

describe('matchesFilter — comparison', () => {
    it('eq and neq compare by identity', () => {
        expect(matchesFilter(row(), f('qty', 'eq', 10))).toBe(true);
        expect(matchesFilter(row(), f('qty', 'eq', '10')), 'eq is strict').toBe(false);
        expect(matchesFilter(row(), f('qty', 'neq', 11))).toBe(true);
    });

    it('the ordered comparisons are inclusive where they say so', () => {
        expect(matchesFilter(row(), f('qty', 'gt', 10))).toBe(false);
        expect(matchesFilter(row(), f('qty', 'gte', 10))).toBe(true);
        expect(matchesFilter(row(), f('qty', 'lt', 10))).toBe(false);
        expect(matchesFilter(row(), f('qty', 'lte', 10))).toBe(true);
    });

    it('the text operators ignore case', () => {
        expect(matchesFilter(row(), f('name', 'contains', 'LPH'))).toBe(true);
        expect(matchesFilter(row(), f('name', 'startswith', 'al'))).toBe(true);
        expect(matchesFilter(row(), f('name', 'endswith', 'HA'))).toBe(true);
        expect(matchesFilter(row(), f('name', 'contains', 'zzz'))).toBe(false);
    });

    it('the text operators stringify, so a number column is still searchable', () => {
        expect(matchesFilter(row(), f('qty', 'contains', '1'))).toBe(true);
    });

    it('isnull and isnotnull treat undefined as null', () => {
        expect(matchesFilter(row(), f('tag', 'isnull'))).toBe(true);
        expect(matchesFilter(row({ tag: undefined }), f('tag', 'isnull'))).toBe(true);
        expect(matchesFilter(row(), f('name', 'isnotnull'))).toBe(true);
        expect(matchesFilter(row(), f('tag', 'isnotnull'))).toBe(false);
    });
});

describe('matchesFilter — set membership', () => {
    it('matches loosely, because a select gives back strings', () => {
        // The row holds the number 1; the filter holds "1" from an <option value>. Requiring a
        // strict match here is the commonest way a multi-select filter silently matches nothing.
        expect(matchesFilter(row({ id: 1 }), f('id', 'in', ['1', '2']))).toBe(true);
        expect(matchesFilter(row({ id: 1 }), f('id', 'in', [1, 2]))).toBe(true);
        expect(matchesFilter(row({ id: 1 }), f('id', 'in', ['3']))).toBe(false);
    });

    it('notin is its complement', () => {
        expect(matchesFilter(row({ id: 1 }), f('id', 'notin', ['3']))).toBe(true);
        expect(matchesFilter(row({ id: 1 }), f('id', 'notin', ['1']))).toBe(false);
    });

    it('an in with a non-array value matches nothing, and notin matches everything', () => {
        expect(matchesFilter(row(), f('id', 'in', 'not-an-array'))).toBe(false);
        expect(matchesFilter(row(), f('id', 'notin', 'not-an-array'))).toBe(true);
    });
});

describe('matchesFilter — between', () => {
    it('is inclusive at both ends', () => {
        expect(matchesFilter(row({ qty: 5 }), f('qty', 'between', [5, 10]))).toBe(true);
        expect(matchesFilter(row({ qty: 10 }), f('qty', 'between', [5, 10]))).toBe(true);
        expect(matchesFilter(row({ qty: 11 }), f('qty', 'between', [5, 10]))).toBe(false);
    });

    it('leaves a side open when its bound is null', () => {
        // "from 5 upwards" and "up to 10" are the two halves of a range filter with one box filled.
        expect(matchesFilter(row({ qty: 999 }), f('qty', 'between', [5, null]))).toBe(true);
        expect(matchesFilter(row({ qty: 1 }), f('qty', 'between', [null, 10]))).toBe(true);
        expect(matchesFilter(row({ qty: 1 }), f('qty', 'between', [5, null]))).toBe(false);
    });

    it('passes everything when the value is not a pair', () => {
        expect(matchesFilter(row(), f('qty', 'between', 5))).toBe(true);
    });
});

describe('matchesFilter — relative dates', () => {
    /** Fixed clock: a relative filter is meaningless without one. */
    function at(iso: string): void {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(iso));
    }

    it('today and yesterday', () => {
        at('2026-06-15T12:00:00');
        expect(matchesFilter({ d: '2026-06-15' }, f('d', 'today'))).toBe(true);
        expect(matchesFilter({ d: '2026-06-14' }, f('d', 'today'))).toBe(false);
        expect(matchesFilter({ d: '2026-06-14' }, f('d', 'yesterday'))).toBe(true);
    });

    it('this week starts on Monday', () => {
        at('2026-06-17T12:00:00');            // a Wednesday
        expect(matchesFilter({ d: '2026-06-15' }, f('d', 'thisweek')), 'Monday').toBe(true);
        expect(matchesFilter({ d: '2026-06-14' }, f('d', 'thisweek')), 'the Sunday before').toBe(false);
    });

    it('this month and this year', () => {
        at('2026-06-15T12:00:00');
        expect(matchesFilter({ d: '2026-06-01' }, f('d', 'thismonth'))).toBe(true);
        expect(matchesFilter({ d: '2026-05-31' }, f('d', 'thismonth'))).toBe(false);
        expect(matchesFilter({ d: '2026-01-01' }, f('d', 'thisyear'))).toBe(true);
        expect(matchesFilter({ d: '2025-12-31' }, f('d', 'thisyear'))).toBe(false);
    });

    it('last 7 and last 30 days include today', () => {
        at('2026-06-15T12:00:00');
        expect(matchesFilter({ d: '2026-06-15' }, f('d', 'last7days'))).toBe(true);
        expect(matchesFilter({ d: '2026-06-09' }, f('d', 'last7days')), 'the seventh day back').toBe(true);
        expect(matchesFilter({ d: '2026-06-08' }, f('d', 'last7days'))).toBe(false);
        expect(matchesFilter({ d: '2026-05-17' }, f('d', 'last30days'))).toBe(true);
    });

    it('reads a date-only string as LOCAL midnight, not UTC', () => {
        // `new Date('2026-06-15')` is UTC midnight, which is the previous day in any western
        // timezone — so "today" would miss today for half the world.
        at('2026-06-15T00:30:00');
        expect(matchesFilter({ d: '2026-06-15' }, f('d', 'today'))).toBe(true);
    });

    it('rejects a row whose date cannot be parsed rather than matching it', () => {
        at('2026-06-15T12:00:00');
        expect(matchesFilter({ d: 'not a date' }, f('d', 'today'))).toBe(false);
    });

    it('passes an operator it does not know, rather than filtering everything out', () => {
        expect(matchesFilter(row(), f('qty', 'sideways', 1))).toBe(true);
    });
});

describe('matchesFilters and composites', () => {
    it('an empty filter list matches everything', () => {
        expect(matchesFilters(row(), [])).toBe(true);
    });

    it('a list is an implicit AND', () => {
        expect(matchesFilters(row(), [f('qty', 'gte', 5), f('name', 'contains', 'lph')])).toBe(true);
        expect(matchesFilters(row(), [f('qty', 'gte', 5), f('name', 'contains', 'zzz')])).toBe(false);
    });

    it('or needs one, and needs at least one', () => {
        const or = { logic: 'or' as const, filters: [f('qty', 'eq', 999), f('name', 'eq', 'Alpha')] };
        expect(matchesCompositeFilter(row(), or)).toBe(true);
        expect(matchesCompositeFilter(row({ name: 'Beta' }), or)).toBe(false);
    });

    it('and needs all of them', () => {
        const and = { logic: 'and' as const, filters: [f('qty', 'eq', 10), f('name', 'eq', 'Alpha')] };
        expect(matchesCompositeFilter(row(), and)).toBe(true);
        expect(matchesCompositeFilter(row({ qty: 1 }), and)).toBe(false);
    });

    it('nests, which is what a filter builder produces', () => {
        const nested = {
            logic: 'and' as const,
            filters: [
                f('qty', 'gte', 5),
                { logic: 'or' as const, filters: [f('name', 'eq', 'Alpha'), f('name', 'eq', 'Beta')] },
            ],
        };
        expect(matchesCompositeFilter(row(), nested)).toBe(true);
        expect(matchesCompositeFilter(row({ name: 'Gamma' }), nested)).toBe(false);
    });
});

describe('clientSort', () => {
    const items = [{ n: 3, s: 'c' }, { n: 1, s: 'a' }, { n: 2, s: 'b' }];

    it('returns the input untouched with no sort', () => {
        expect(clientSort(items, [])).toBe(items);
    });

    it('does not mutate the array it was given', () => {
        const sorted = clientSort(items, [{ field: 'n', dir: 'asc' }]);
        expect(sorted).not.toBe(items);
        expect(items[0].n, 'the caller\'s array was reordered under it').toBe(3);
    });

    it('sorts ascending and descending', () => {
        expect(clientSort(items, [{ field: 'n', dir: 'asc' }]).map(i => i.n)).toEqual([1, 2, 3]);
        expect(clientSort(items, [{ field: 'n', dir: 'desc' }]).map(i => i.n)).toEqual([3, 2, 1]);
    });

    it('falls through to the next field when the first ties', () => {
        const rows = [{ a: 1, b: 'z' }, { a: 1, b: 'a' }, { a: 0, b: 'm' }];
        const out = clientSort(rows, [{ field: 'a', dir: 'asc' }, { field: 'b', dir: 'asc' }]);
        expect(out.map(r => r.b)).toEqual(['m', 'a', 'z']);
    });

    it('puts nulls last, in both directions', () => {
        // Not "wherever null happens to compare": an empty cell belongs at the end of the list the
        // user is reading, whichever way they sorted it.
        const rows = [{ v: 2 }, { v: null }, { v: 1 }];
        expect(clientSort(rows, [{ field: 'v', dir: 'asc' }]).map(r => r.v)).toEqual([1, 2, null]);
        expect(clientSort(rows, [{ field: 'v', dir: 'desc' }]).map(r => r.v)).toEqual([2, 1, null]);
    });
});

describe('clientGroup', () => {
    const rows = [
        { cat: 'b', qty: 1 }, { cat: 'a', qty: 2 }, { cat: 'b', qty: 3 }, { cat: 'a', qty: 4 },
    ];

    it('returns nothing with no descriptors', () => {
        expect(clientGroup(rows, [])).toEqual([]);
    });

    it('buckets by the field and orders the keys', () => {
        const groups = clientGroup(rows, [{ field: 'cat' }]);
        expect(groups.map(g => g.value)).toEqual(['a', 'b']);
        expect(groups[0].items).toHaveLength(2);
    });

    it('orders the keys descending when asked', () => {
        const groups = clientGroup(rows, [{ field: 'cat', dir: 'desc' }]);
        expect(groups.map(g => g.value)).toEqual(['b', 'a']);
    });

    it('puts a null key last', () => {
        const withNull = [...rows, { cat: null, qty: 9 }];
        const groups = clientGroup(withNull, [{ field: 'cat' }]);
        expect(groups[groups.length - 1].value).toBeNull();
    });

    it('nests for a second level', () => {
        const data = [
            { a: 'x', b: 1 }, { a: 'x', b: 2 }, { a: 'y', b: 1 },
        ];
        const groups = clientGroup(data, [{ field: 'a' }, { field: 'b' }]);
        expect(groups).toHaveLength(2);
        const inner = groups[0].items as { value: unknown }[];
        expect(inner.map(g => g.value)).toEqual([1, 2]);
    });

    it('computes the aggregates it was asked for, keyed by field and name', () => {
        const groups = clientGroup(rows, [{
            field: 'cat',
            aggregates: [{ field: 'qty', aggregate: 'sum' }, { field: 'qty', aggregate: 'count' }],
        }]);
        expect(groups[0].aggregates).toEqual({ qty_sum: 6, qty_count: 2 });
    });

    it('leaves aggregates undefined when none were asked for', () => {
        expect(clientGroup(rows, [{ field: 'cat' }])[0].aggregates).toBeUndefined();
    });
});

describe('aggregateColumn', () => {
    it('counts every value, including the empty ones', () => {
        expect(aggregateColumn([1, null, 3, undefined], 'count'),
            'a count of rows that skips empty cells is not a count of rows').toBe(4);
    });

    it('ignores null and unparseable values in the numeric aggregates', () => {
        const vals = [1, null, '3', 'abc', undefined];
        expect(aggregateColumn(vals, 'sum')).toBe(4);
        expect(aggregateColumn(vals, 'min')).toBe(1);
        expect(aggregateColumn(vals, 'max')).toBe(3);
        expect(aggregateColumn(vals, 'avg')).toBe(2);
    });

    it('treats average as an alias of avg', () => {
        expect(aggregateColumn([2, 4], 'average')).toBe(2 + 1);
    });

    it('answers 0 rather than NaN or Infinity for an empty column', () => {
        // Math.min() of nothing is Infinity and a sum/0 is NaN; either would be rendered.
        expect(aggregateColumn([], 'sum')).toBe(0);
        expect(aggregateColumn([], 'avg')).toBe(0);
        expect(aggregateColumn([], 'min')).toBe(0);
        expect(aggregateColumn([], 'max')).toBe(0);
        expect(aggregateColumn([], 'count')).toBe(0);
    });

    it('takes a custom reducer and hands it the raw values', () => {
        expect(aggregateColumn(['a', 'b'], (values) => values.join('/'))).toBe('a/b');
    });

    it('returns undefined for a name it does not know', () => {
        expect(aggregateColumn([1], 'median' as never)).toBeUndefined();
    });
});

describe('computeDiff', () => {
    it('returns only what changed', () => {
        expect(computeDiff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: 3 });
    });

    it('returns null when nothing changed, so a PATCH is not sent', () => {
        expect(computeDiff({ a: 1 }, { a: 1 })).toBeNull();
    });

    it('sees a change to null or undefined', () => {
        expect(computeDiff({ a: 1 }, { a: null })).toEqual({ a: null });
        expect(computeDiff({ a: 1 }, { a: undefined })).toEqual({ a: undefined });
    });

    it('compares with Object.is, so NaN equals NaN and -0 does not equal 0', () => {
        // A cell that was NaN and still is has not been edited; +0 and -0 read the same and are
        // not, which is the distinction Object.is exists for.
        expect(computeDiff({ a: NaN }, { a: NaN })).toBeNull();
        expect(computeDiff({ a: 0 }, { a: -0 })).toEqual({ a: -0 });
    });

    it('only looks at the keys the update has', () => {
        // A partial update must not be read as "delete everything else".
        expect(computeDiff({ a: 1, b: 2 }, { a: 2 } as { a: number; b: number })).toEqual({ a: 2 });
    });
});
