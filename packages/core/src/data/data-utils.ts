// Shared utilities for DataSource and array transport.
// Client-side filter matching, sorting, grouping, and diff.

import type { FilterDescriptor, CompositeFilter, SortDescriptor } from './transport';
import type { AggregateType } from './data-grid-types';

// ─── Relative date ranges (today / this month / last 7 days …) ──

const DAY_MS = 86400000;
/** Parse a date-only string ("YYYY-MM-DD") as LOCAL midnight; else delegate to Date. */
function toTimestamp(v: unknown): number {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00').getTime();
    return new Date(v as string | number | Date).getTime();
}
/** [min inclusive, max exclusive) timestamp range for a relative date operator. */
function relativeDateRange(op: string): [number, number] {
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); // start of today (local)
    switch (op) {
        case 'today': return [sod, sod + DAY_MS];
        case 'yesterday': return [sod - DAY_MS, sod];
        case 'thisweek': { const dow = (now.getDay() + 6) % 7; const s = sod - dow * DAY_MS; return [s, s + 7 * DAY_MS]; } // Monday-start
        case 'thismonth': return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()];
        case 'thisyear': return [new Date(now.getFullYear(), 0, 1).getTime(), new Date(now.getFullYear() + 1, 0, 1).getTime()];
        case 'last7days': return [sod - 6 * DAY_MS, sod + DAY_MS]; // ultimi 7 giorni, oggi incluso
        case 'last30days': return [sod - 29 * DAY_MS, sod + DAY_MS];
        default: return [-Infinity, Infinity];
    }
}
const RELATIVE_OPS = new Set(['today', 'yesterday', 'thisweek', 'thismonth', 'thisyear', 'last7days', 'last30days']);

// ─── Filter Matching ──────────────────────────────────────────

/** Match a single filter against an item. */
export function matchesFilter<T extends Record<string, unknown>>(
    item: T,
    f: FilterDescriptor,
): boolean {
    const val = item[f.field];
    const target = f.value;
    switch (f.operator) {
        case 'eq': return val === target;
        case 'neq': return val !== target;
        case 'gt': return (val as number) > (target as number);
        case 'gte': return (val as number) >= (target as number);
        case 'lt': return (val as number) < (target as number);
        case 'lte': return (val as number) <= (target as number);
        case 'contains': return String(val).toLowerCase().includes(String(target).toLowerCase());
        case 'startswith': return String(val).toLowerCase().startsWith(String(target).toLowerCase());
        case 'endswith': return String(val).toLowerCase().endsWith(String(target).toLowerCase());
        case 'isnull': return val == null;
        case 'isnotnull': return val != null;
        // Set membership — a loose comparison: the values from the UI often arrive as strings
        // (an option value), while the item may be numeric → match by value or by string.
        case 'in': return Array.isArray(target) && target.some(t => t === val || String(t) === String(val));
        case 'notin': return !Array.isArray(target) || !target.some(t => t === val || String(t) === String(val));
        // Range [min, max]; a null/undefined bound = open on that side.
        case 'between': {
            if (!Array.isArray(target)) return true;
            const [min, max] = target as [unknown, unknown];
            return (min == null || (val as number) >= (min as number)) && (max == null || (val as number) <= (max as number));
        }
        default:
            // Relative date presets — computed against "now"; no target.
            if (RELATIVE_OPS.has(f.operator)) {
                const ts = toTimestamp(val);
                if (Number.isNaN(ts)) return false;
                const [min, max] = relativeDateRange(f.operator);
                return ts >= min && ts < max;
            }
            return true;
    }
}

/** Match a composite filter (recursive AND/OR) against an item. */
export function matchesCompositeFilter<T extends Record<string, unknown>>(
    item: T,
    filter: CompositeFilter,
): boolean {
    return filter.logic === 'or'
        ? filter.filters.some(f => matchesAny(item, f))
        : filter.filters.every(f => matchesAny(item, f));
}

/** Match a single FilterDescriptor or CompositeFilter. */
function matchesAny<T extends Record<string, unknown>>(
    item: T,
    filter: FilterDescriptor | CompositeFilter,
): boolean {
    if ('logic' in filter) return matchesCompositeFilter(item, filter);
    return matchesFilter(item, filter);
}

/** Match an array of filters (all must pass = implicit AND). */
export function matchesFilters<T extends Record<string, unknown>>(
    item: T,
    filters: (FilterDescriptor | CompositeFilter)[],
): boolean {
    if (filters.length === 0) return true;
    return filters.every(f => matchesAny(item, f));
}

// ─── Client-Side Sort ─────────────────────────────────────────

/** Sort items by multiple fields (stable sort). */
export function clientSort<T extends Record<string, unknown>>(
    items: T[],
    sort: SortDescriptor[],
): T[] {
    if (sort.length === 0) return items;
    return items.slice().sort((a, b) => {
        for (const s of sort) {
            const av = a[s.field];
            const bv = b[s.field];
            if (av === bv) continue;
            if (av == null) return 1;
            if (bv == null) return -1;
            const cmp = av < bv ? -1 : 1;
            return s.dir === 'desc' ? -cmp : cmp;
        }
        return 0;
    });
}

// ─── Client-Side Grouping ─────────────────────────────────────

export interface GroupDescriptor {
    field: string;
    dir?: 'asc' | 'desc';
    aggregates?: AggregateDescriptor[];
}

export interface AggregateDescriptor {
    field: string;
    aggregate: 'count' | 'sum' | 'average' | 'min' | 'max';
}

export interface GroupResult<T> {
    field: string;
    value: unknown;
    items: T[] | GroupResult<T>[];
    aggregates?: Record<string, number>;
}

/** Group items by descriptors (recursive for multi-level). */
export function clientGroup<T extends Record<string, unknown>>(
    items: T[],
    groups: GroupDescriptor[],
): GroupResult<T>[] {
    if (groups.length === 0) return [];
    const [first, ...rest] = groups;
    const buckets = new Map<unknown, T[]>();

    for (const item of items) {
        const key = item[first.field];
        let bucket = buckets.get(key);
        if (!bucket) { bucket = []; buckets.set(key, bucket); }
        bucket.push(item);
    }

    // Sort group keys
    const sortedKeys = Array.from(buckets.keys()).sort((a, b) => {
        if (a == null) return 1;
        if (b == null) return -1;
        const cmp = a < b ? -1 : a > b ? 1 : 0;
        return first.dir === 'desc' ? -cmp : cmp;
    });

    return sortedKeys.map(key => {
        const groupItems = buckets.get(key)!;
        const result: GroupResult<T> = {
            field: first.field,
            value: key,
            items: rest.length > 0 ? clientGroup(groupItems, rest) : groupItems,
        };
        if (first.aggregates && first.aggregates.length > 0) {
            result.aggregates = computeAggregates(groupItems, first.aggregates);
        }
        return result;
    });
}

// ─── Column aggregation (shared base for group aggregates + footer summary row) ──

/** Aggregate spec: an enum name (`sum`/`avg`/`count`/`min`/`max`, `average` alias of `avg`)
 *  or a custom reducer over the raw column values. */
export type AggregateSpec = AggregateType | 'average' | ((values: unknown[]) => unknown);

/**
 * Compute a single aggregate over a column's raw values. Single source of truth used by both
 * per-group aggregates and the footer summary row. Handles the enum forms AND the function form,
 * normalizing the `'avg'` ↔ `'average'` alias (AggregateType uses `avg`, AggregateDescriptor uses
 * `average`). `count` counts all values (including null); numeric aggregates ignore null/NaN.
 */
export function aggregateColumn(values: unknown[], spec: AggregateSpec): unknown {
    if (typeof spec === 'function') return spec(values);
    const name = spec === 'average' ? 'avg' : spec;
    if (name === 'count') return values.length;
    const nums = values
        .filter(v => v != null)
        .map(v => Number(v))
        .filter(v => !Number.isNaN(v));
    switch (name) {
        case 'sum': return nums.reduce((a, b) => a + b, 0);
        case 'avg': return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        case 'min': return nums.length > 0 ? Math.min(...nums) : 0;
        case 'max': return nums.length > 0 ? Math.max(...nums) : 0;
        default: return undefined;
    }
}

function computeAggregates<T extends Record<string, unknown>>(
    items: T[],
    aggregates: AggregateDescriptor[],
): Record<string, number> {
    const result: Record<string, number> = {};
    for (const agg of aggregates) {
        const key = `${agg.field}_${agg.aggregate}`;
        const values = items.map(i => i[agg.field]);
        result[key] = aggregateColumn(values, agg.aggregate) as number;
    }
    return result;
}

// ─── Diff (for PATCH) ─────────────────────────────────────────

/** Compute the diff between original and updated. Returns null if identical. */
export function computeDiff<T extends Record<string, unknown>>(
    original: T,
    updated: T,
): Partial<T> | null {
    const diff: Partial<T> = {};
    let hasDiff = false;
    for (const key of Object.keys(updated) as (keyof T & string)[]) {
        if (!Object.is(original[key], updated[key])) {
            (diff as Record<string, unknown>)[key] = updated[key];
            hasDiff = true;
        }
    }
    return hasDiff ? diff : null;
}
