// filter-state — a saved filter descriptor, read back into the state the condition editor works in.
//
// This is the inverse of `stateToFilter` in ./filter-popover.ts and belongs beside it. It is here
// instead because that file is already 650 lines, and adding to it makes a file that is over the
// limit worse. ⚠️ The two change together: an operator or a value encoding taught to one and not the
// other loses a saved filter in silence.

import type { FilterDescriptor, CompositeFilter, FilterOperator } from '@pdxui/core';
import { FILTER_BLANK, createEmptyState } from './filter-popover';
import type { FilterConditionState, FilterFieldInfo } from './filter-popover';

/** Encode a filter value back into the string the editor holds for it. */
function valueToText(value: unknown, op: FilterOperator): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
        // `in`/`notin` carry a null as the "(Blanks)" sentinel; `between` carries it as an open bound.
        const blank = (op === 'in' || op === 'notin') ? FILTER_BLANK : '';
        return value.map(v => (v === null || v === undefined) ? blank : String(v)).join('|');
    }
    return String(value);
}

/** The field a saved filter is about, or null when it is not about a single field. */
export function filterField(filter: FilterDescriptor | CompositeFilter): string | null {
    if (!('logic' in filter)) return filter.field;
    const first = filter.filters.find(f => !('logic' in f)) as FilterDescriptor | undefined;
    return first ? first.field : null;
}

/** Read a saved filter back into editor state. Null when it is not about `field`. */
export function filterToState(
    filter: FilterDescriptor | CompositeFilter,
    field: FilterFieldInfo,
): FilterConditionState | null {
    const base = createEmptyState(field);
    if ('logic' in filter) {
        const parts = filter.filters.filter(f => !('logic' in f)) as FilterDescriptor[];
        if (!parts.length || parts.some(f => f.field !== field.field)) return null;
        const [a, b] = parts;
        return {
            op1: a.operator, val1: valueToText(a.value, a.operator),
            logic: filter.logic === 'or' ? 'or' : 'and',
            op2: b ? b.operator : base.op2, val2: b ? valueToText(b.value, b.operator) : '',
        };
    }
    if (filter.field !== field.field) return null;
    return { ...base, op1: filter.operator, val1: valueToText(filter.value, filter.operator) };
}
