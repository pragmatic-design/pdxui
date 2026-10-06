// BUG 5 — grid summary / total row. buildSummaryRow mirrors the header (one cell per visible
// column) and fills cells for columns with `aggregate`; other cells stay empty. hasSummary gates
// whether the row is rendered at all.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup } from './helpers';
import { useDataGrid } from '@pdxui/core';
import { buildSummaryRow, hasSummary } from '../../src/data-grid/grid-summary';
import type { GridContext } from '../../src/data-grid/grid-context';

const rows = [{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }, { name: 'c', qty: 3 }];

function gcFor(cols: unknown, dataRows: unknown[] = rows): GridContext {
    return {
        isExpandable: () => false,
        getSelectionMode: () => 'none',
        grid: { rows: { peek: () => dataRows }, columns: { peek: () => cols } },
    } as unknown as GridContext;
}

describe('grid-summary — aggregate row', () => {
    beforeEach(cleanup);

    it('renders .pdx-dg-summary with the correct sum, empty cells elsewhere', () => {
        const grid = useDataGrid({ source: rows, columns: [{ field: 'name' }, { field: 'qty', aggregate: 'sum' }] });
        const cols = grid.columns();

        expect(hasSummary(cols)).toBe(true);

        const row = buildSummaryRow(gcFor(cols), cols);
        expect(row.classList.contains('pdx-dg-summary')).toBe(true);
        expect(row.getAttribute('role')).toBe('row');

        const cells = row.querySelectorAll('.pdx-dg-summary-cell');
        expect(cells.length).toBe(2); // one cell per visible column

        expect(row.querySelector('[data-field="qty"]')!.textContent).toBe('6');
        expect(row.querySelector('[data-field="name"]')!.textContent).toBe(''); // no aggregate → empty
    });

    it('formats a non-integer average to 2 decimals', () => {
        const avgRows = [{ n: 1 }, { n: 2 }];
        const grid = useDataGrid({ source: avgRows, columns: [{ field: 'n', aggregate: 'avg' }] });
        const cols = grid.columns();
        const row = buildSummaryRow(gcFor(cols, avgRows), cols);
        expect(row.querySelector('[data-field="n"]')!.textContent).toBe('1.50');
    });

    it('no summary when no column declares an aggregate', () => {
        const grid = useDataGrid({ source: rows, columns: [{ field: 'name' }, { field: 'qty' }] });
        expect(hasSummary(grid.columns())).toBe(false);
    });
});
