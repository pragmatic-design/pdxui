// Grid summary / total row (BUG 5) — footer aggregate row for columns with `aggregate`.
// Mirrors the header structure (leading spacers + one cell per visible column) so the totals
// stay aligned under their columns. Lives OUTSIDE the virtualized body (sticky sibling), so it
// is unaffected by virtual scroll windowing.

import type { GridContext, AnyColumn } from './grid-context';
import { applyColSize } from './grid-context';
import { aggregateColumn, getFieldValue } from '@pdxui/core';

/** True when at least one visible column declares an `aggregate` → render the summary row. */
export function hasSummary(cols: AnyColumn[]): boolean {
    return cols.some(c => c.visible && c.def.aggregate != null);
}

/** Format an aggregate result for display (integers verbatim, other numbers to 2 decimals). */
function formatSummary(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'number') {
        if (!Number.isFinite(v)) return String(v);
        return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return String(v);
}

/** Build the summary row: leading spacers, then one cell per visible column (aggregate or empty). */
export function buildSummaryRow(gc: GridContext, cols: AnyColumn[]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'pdx-dg-summary';
    row.setAttribute('role', 'row');

    // Leading spacers — mirror the header (expand chevron column, then selection checkbox).
    // Every cell is a gridcell: a row with none is not a row to assistive technology.
    if (gc.isExpandable()) {
        const spacer = document.createElement('div');
        spacer.className = 'pdx-dg-summary-cell pdx-dg-expand-cell';
        spacer.setAttribute('role', 'gridcell');
        row.appendChild(spacer);
    }
    if (gc.getSelectionMode() !== 'none') {
        const spacer = document.createElement('div');
        spacer.className = 'pdx-dg-summary-cell pdx-dg-checkbox';
        spacer.setAttribute('role', 'gridcell');
        row.appendChild(spacer);
    }

    const rows = (gc.grid?.rows.peek() ?? []) as Record<string, unknown>[];
    const visibleCols = cols.filter(c => c.visible);
    for (const col of visibleCols) {
        const cell = document.createElement('div');
        cell.className = 'pdx-dg-summary-cell';
        if (col.align === 'right') cell.classList.add('pdx-dg-td-right');
        else if (col.align === 'center') cell.classList.add('pdx-dg-td-center');
        applyColSize(cell, col);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('data-field', col.field);

        const spec = col.def.aggregate;
        if (spec != null) {
            const values = rows.map(r => col.def.compute ? col.def.compute(r) : getFieldValue(r, col.field));
            cell.textContent = formatSummary(aggregateColumn(values, spec as never));
        }
        row.appendChild(cell);
    }
    return row;
}
