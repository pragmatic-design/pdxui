// Filter popover — set operators (in/notin) round-trip + enum operator defaults.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import { stateToFilter, getFieldOperators, getOpLabel, FILTER_BLANK, buildFilterPopoverContent } from '../../src/shared/filter-popover';
import type { FilterConditionState, FilterFieldInfo } from '../../src/shared/filter-popover';

const enumField: FilterFieldInfo = { field: 'cat', label: 'Category', type: 'enum' };

function state(p: Partial<FilterConditionState>): FilterConditionState {
    return { op1: 'in', val1: '', logic: 'and', op2: 'in', val2: '', ...p };
}

describe('filter-popover — enum/set operators', () => {
    it('enum fields default to set operators (in/notin), not text', () => {
        const ops = getFieldOperators(enumField).map(o => o.value);
        expect(ops).toContain('in');
        expect(ops).toContain('notin');
        expect(ops).not.toContain('contains');
    });

    it('stateToFilter serializes `in` pipe-string → array', () => {
        const f = stateToFilter('cat', state({ op1: 'in', val1: 'a|b|c' })) as any;
        expect(f).toEqual({ field: 'cat', operator: 'in', value: ['a', 'b', 'c'] });
    });

    it('stateToFilter serializes `notin` pipe-string → array', () => {
        const f = stateToFilter('cat', state({ op1: 'notin', val1: 'x|y' })) as any;
        expect(f).toEqual({ field: 'cat', operator: 'notin', value: ['x', 'y'] });
    });

    it('empty selection → null (no filter)', () => {
        expect(stateToFilter('cat', state({ op1: 'in', val1: '' }))).toBeNull();
    });

    it('the sentinel (Blanks) → null in the in-value (set filter)', () => {
        const f = stateToFilter('cat', state({ op1: 'in', val1: `A|${FILTER_BLANK}|B` })) as any;
        expect(f.value).toEqual(['A', null, 'B']);
    });
});

describe('filter-popover — the operator labels', () => {
    it('a date gets the time labels (After/Before), text the generic ones', () => {
        expect(getOpLabel('gt', 'date')).toBe('After');
        expect(getOpLabel('lte', 'date')).toBe('On or before');
        expect(getOpLabel('gt', 'number')).toBe('Greater than');
        expect(getOpLabel('gt')).toBe('Greater than');
    });
    it('a date field offers isnotnull among its operators', () => {
        const ops = getFieldOperators({ field: 'd', label: 'D', type: 'date' }).map(o => o.value);
        expect(ops).toContain('isnotnull');
    });
    it('number/date espongono between', () => {
        for (const t of ['number', 'date'] as const) {
            expect(getFieldOperators({ field: 'x', label: 'X', type: t }).map(o => o.value)).toContain('between');
        }
        expect(getFieldOperators({ field: 'x', label: 'X', type: 'text' }).map(o => o.value)).not.toContain('between');
    });
});

describe('filter-popover — between', () => {
    const st = (p: Partial<FilterConditionState>): FilterConditionState =>
        ({ op1: 'between', val1: '', logic: 'and', op2: 'between', val2: '', ...p });

    it('serializza "min|max" → [min, max] numerici', () => {
        const f = stateToFilter('price', st({ op1: 'between', val1: '10|100' })) as any;
        expect(f).toEqual({ field: 'price', operator: 'between', value: [10, 100] });
    });
    it('an empty bound → null (an open range)', () => {
        const f = stateToFilter('price', st({ op1: 'between', val1: '10|' })) as any;
        expect(f.value).toEqual([10, null]);
    });
    it('between with no bounds → null (no filter)', () => {
        expect(stateToFilter('price', st({ op1: 'between', val1: '|' }))).toBeNull();
    });
});

describe('filter-popover — relative date', () => {
    it('date exposes the relative operators (today, last7days…)', () => {
        const ops = getFieldOperators({ field: 'd', label: 'D', type: 'date' }).map(o => o.value);
        for (const o of ['today', 'yesterday', 'thismonth', 'last7days', 'last30days']) expect(ops).toContain(o);
    });
    it('a relative operator → valid with no value, value null', () => {
        const s: FilterConditionState = { op1: 'today', val1: '__null__', logic: 'and', op2: 'eq', val2: '' };
        expect(stateToFilter('d', s)).toEqual({ field: 'd', operator: 'today', value: null });
    });
    it('label leggibili (Today / Last 7 days)', () => {
        expect(getOpLabel('today', 'date')).toBe('Today');
        expect(getOpLabel('last7days', 'date')).toBe('Last 7 days');
    });
});

// The server value list's «Loading…» and «No matches» are component strings: written as literals in a
// textContent conditional, the literal-string guard would not see them.
describe('filter-popover — the server value list is translatable', () => {
    afterEach(() => { document.body.innerHTML = ''; clearComponentStrings(); });

    it('says shared.loading while the options load, and shared.noMatches when none come back', async () => {
        setComponentStrings('shared', { loading: 'Caricamento…', noMatches: 'Nessun risultato' });
        let resolve!: (items: { label: string; value: unknown }[]) => void;
        const field: FilterFieldInfo = {
            ...enumField,
            optionsSource: () => new Promise((r) => { resolve = r; }),
        };
        const container = document.createElement('div');
        document.body.appendChild(container);
        buildFilterPopoverContent(container, field, state({}), { onApply: () => {}, onClear: () => {}, onClose: () => {} });
        const message = (): string | undefined => container.querySelector('.pdx-dg-fp-enum-empty')?.textContent ?? undefined;

        expect(message()).toBe('Caricamento…');
        resolve([]);
        await vi.waitFor(() => { expect(message()).toBe('Nessun risultato'); });
    });
});
