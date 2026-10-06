// BUG 7 — column groups render as a two-row header (group labels on top, leaf headers below).
// Columns without `children` keep the original single-row header (feature-detected).

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup } from './helpers';
import { useDataGrid } from '@pdxui/core';
import { buildHeader } from '../../src/data-grid/grid-header';
import type { GridContext } from '../../src/data-grid/grid-context';

function gcFor(grid: unknown): GridContext {
    return {
        isExpandable: () => false,
        getSelectionMode: () => 'none',
        hasFilterRow: () => true, // suppress filter icon → keep asserted DOM minimal
        hasToolbar: () => false,
        getSlot: () => undefined,
        popoverFilters: {},
        grid,
    } as unknown as GridContext;
}

describe('grid-header — column groups', () => {
    beforeEach(cleanup);

    it('renders two header rows with a spanning group cell', () => {
        const grid = useDataGrid({
            source: [{ city: 'Rome', zip: '00100' }],
            columns: [
                { header: 'Name' },
                { header: 'Address', children: [{ field: 'city' }, { field: 'zip' }] },
            ] as never,
        });
        const cols = grid.columns();

        // Body operates on the 3 flat leaves.
        expect(cols.length).toBe(3);

        const header = buildHeader(gcFor(grid), cols);
        expect(header.classList.contains('pdx-dg-header-grouped')).toBe(true);

        const rowEls = header.querySelectorAll('[role="row"]');
        expect(rowEls.length).toBe(2);

        const groupCell = header.querySelector('.pdx-dg-th-group')!;
        expect(groupCell.getAttribute('aria-colspan')).toBe('2');
        expect(groupCell.textContent).toContain('Address');

        const topRow = rowEls[0];
        const leafRow = rowEls[1];
        // Top-level column label lives in the top row and NOT in the leaf row.
        expect(topRow.textContent).toContain('Name');
        expect(leafRow.textContent).not.toContain('Name');
        // Group leaves live in the leaf (second) row.
        expect(leafRow.querySelector('[data-field="city"]')).toBeTruthy();
        expect(leafRow.querySelector('[data-field="zip"]')).toBeTruthy();
    });

    it('columns without children keep the single-row header', () => {
        const grid = useDataGrid({
            source: [{ a: 1, b: 2 }],
            columns: [{ field: 'a' }, { field: 'b' }],
        });
        const header = buildHeader(gcFor(grid), grid.columns());

        expect(header.classList.contains('pdx-dg-header-grouped')).toBe(false);
        expect(header.getAttribute('role')).toBe('row'); // the container IS the single row
        expect(header.querySelectorAll('.pdx-dg-th-group').length).toBe(0);
    });
});
