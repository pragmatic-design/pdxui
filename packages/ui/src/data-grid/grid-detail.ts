// Grid row detail — expand/collapse rows to show detail panel.
// Pattern follows grid-grouping.ts (module-level Set + event-driven re-render).

import type { GridContext } from './grid-context';
import { GRID_WIDGET } from './grid-context';
import { t } from './grid-i18n';

// ─── Expanded row state (per-grid via GridContext) ──────────

export function toggleRowDetail(gc: GridContext, id: unknown): void {
    if (gc.expandedRows.has(id)) {
        gc.expandedRows.delete(id);
        gc.emit('pdx-row-collapse', { id });
    } else {
        gc.expandedRows.add(id);
        gc.emit('pdx-row-expand', { id });
    }
}

export function isRowExpanded(gc: GridContext, id: unknown): boolean {
    return gc.expandedRows.has(id);
}

// ─── Render expand chevron cell ─────────────────────────────

export function renderExpandCell(gc: GridContext, rowId: unknown): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'pdx-dg-td pdx-dg-expand-cell';
    cell.setAttribute('role', 'gridcell');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pdx-dg-expand-btn';
    btn.setAttribute(GRID_WIDGET, '');
    btn.setAttribute('aria-expanded', String(gc.expandedRows.has(rowId)));
    btn.setAttribute('aria-label', t(gc.expandedRows.has(rowId) ? 'detail.collapse' : 'detail.expand'));
    btn.textContent = gc.expandedRows.has(rowId) ? '▼' : '▶';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        gc.emit('__toggle-detail', { id: rowId });
    });

    cell.appendChild(btn);
    return cell;
}

// ─── Render detail row ──────────────────────────────────────

export function renderDetailRow(gc: GridContext, row: Record<string, unknown>, index: number, rowId: unknown): HTMLElement | null {
    if (!gc.expandedRows.has(rowId)) return null;

    const detailSlot = gc.getSlot('detail');
    if (!detailSlot) return null;

    const detailEl = document.createElement('div');
    detailEl.className = 'pdx-dg-detail-row';
    detailEl.setAttribute('data-detail-id', String(rowId));

    const content = detailSlot({ row, index, id: rowId });
    detailEl.appendChild(content instanceof DocumentFragment ? content : content);

    return detailEl;
}
