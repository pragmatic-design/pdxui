// Grid accessibility layer — what makes pdx-data-grid a grid to assistive technology and to the
// keyboard, for every grid, not only an editable one.
//
// · The grid is the scroll area (.pdx-dg-scroll): header, filter row, body, summary. The toolbar,
//   the group bar and the pager sit beside it — a grid owns rows, not a toolbar or a pager's buttons.
// · ARIA: aria-rowcount / aria-colcount (the total, not the page), aria-rowindex on each row,
//   aria-multiselectable, the grid's name.
// · Keyboard (the APG data grid): ONE cell in the tab order — the header row included — and the
//   arrows, Home/End, Ctrl+Home/End, PageUp/PageDown move it. A cell holding one control (a row's
//   checkbox, a sort button, a group toggle, a detail chevron — marked GRID_WIDGET) hands the tab stop
//   to that control, so Enter and Space act natively. Other controls in a cell (a header's filter
//   button, a command column's buttons) and the filter row's inputs keep their own tab stops.
//
// Header and body are rebuilt on every data change, so the position is kept by row identity (its id,
// its group, or its place for header rows) and the focus is put back after a rebuild when the grid
// had it. Cells were tabindex -1 and the arrows did nothing unless `editable` was set.

import type { GridContext, AnyColumn } from './grid-context';
import { GRID_WIDGET, NAV_SKIP } from './grid-context';
import { startCellEdit } from './grid-edit';
import { getFieldValue } from '@pdxui/core';

const CELL_ROLES = new Set(['gridcell', 'columnheader', 'rowheader']);

/** Rows the keyboard walks, in document order: header row(s), body rows, the summary. */
function navRows(grid: HTMLElement): HTMLElement[] {
    return [...grid.querySelectorAll<HTMLElement>('[role="row"]')]
        .filter(r => !r.hasAttribute(NAV_SKIP) && cellsOf(r).length > 0);
}

function cellsOf(row: Element): HTMLElement[] {
    return [...row.children].filter(c => CELL_ROLES.has(c.getAttribute('role') ?? '')) as HTMLElement[];
}

/** Where a cell's tab stop goes: its single marked control, or the cell itself. */
function targetOf(cell: HTMLElement): HTMLElement {
    const widgets = cell.querySelectorAll<HTMLElement>(`[${GRID_WIDGET}]`);
    return widgets.length === 1 ? widgets[0] : cell;
}

/** A row's identity across rebuilds: its id, its group, or its index (header and summary rows). */
function rowKey(row: HTMLElement, index: number): string {
    if (row.dataset.rowId != null) return `r:${row.dataset.rowId}`;
    if (row.dataset.groupKey != null) return `g:${row.dataset.groupKey}`;
    return `i:${index}`;
}

function cellOfTarget(grid: HTMLElement, node: Element | null): HTMLElement | null {
    const cell = node?.closest('[role="gridcell"], [role="columnheader"], [role="rowheader"]') as HTMLElement | null;
    const row = cell?.closest('[role="row"]');
    return cell && row && grid.contains(row) && !row.hasAttribute(NAV_SKIP) ? cell : null;
}

// ─── ARIA ───────────────────────────────────────────────────

/** Name, counts and indices, re-applied after every render. (A row's aria-selected is set where the
 *  row is drawn and where the selection changes: grid-body, grid-virtual, grid-selection.) */
export function applyGridAria(gc: GridContext, grid: HTMLElement): void {
    const label = gc.getLabel?.() ?? '';
    if (label) grid.setAttribute('aria-label', label); else grid.removeAttribute('aria-label');
    if (gc.getSelectionMode() === 'multiple') grid.setAttribute('aria-multiselectable', 'true');
    else grid.removeAttribute('aria-multiselectable');

    const header = grid.querySelector('.pdx-dg-header');
    const headerRows = header ? (header.getAttribute('role') === 'row'
        ? [header as HTMLElement]
        : [...header.querySelectorAll<HTMLElement>('[role="row"]')]) : [];
    const filterRow = grid.querySelector<HTMLElement>(`[role="row"][${NAV_SKIP}]`);
    const top = [...headerRows, ...(filterRow ? [filterRow] : [])];
    top.forEach((r, i) => r.setAttribute('aria-rowindex', String(i + 1)));
    // Counted on the first header row: in a two-row header its cells span every column (a group's
    // aria-colspan, a lone column's aria-rowspan), where the leaf row skips the lone ones.
    const first = headerRows[0];
    const colCount = first ? cellsOf(first).reduce((n, c) => n + Number(c.getAttribute('aria-colspan') || 1), 0) : 0;
    if (colCount) grid.setAttribute('aria-colcount', String(colCount));

    const body = grid.querySelector('.pdx-dg-body');
    const dataRows = body ? [...body.querySelectorAll<HTMLElement>('.pdx-dg-row[data-row-index]')] : [];
    const grouped = !!body?.querySelector('.pdx-dg-group-row');
    const summary = grid.querySelector<HTMLElement>('.pdx-dg-summary[role="row"]');
    const g = gc.grid;
    if (g && !grouped) {
        // Every row counted, the header included: a paginated or virtual grid holds only some in the
        // DOM, and a row's index says where it sits in the whole set.
        const total = g.total.peek() as number;
        const count = total >= 0 ? total : (g.rows.peek() as unknown[]).length;
        const pageSize = (g.source?.pageSize?.peek?.() as number | undefined) ?? 0;
        const page = (g.page.peek() as number) || 1;
        const offset = pageSize > 0 ? (page - 1) * pageSize : 0;
        const rowCount = top.length + count + (summary ? 1 : 0);
        grid.setAttribute('aria-rowcount', String(rowCount));
        for (const r of dataRows) {
            r.setAttribute('aria-rowindex', String(top.length + offset + Number(r.dataset.rowIndex) + 1));
        }
        summary?.setAttribute('aria-rowindex', String(rowCount));
    } else {
        // Grouped: group rows interleave the data, and the rows of an open group are all in the DOM.
        grid.removeAttribute('aria-rowcount');
        for (const r of dataRows) r.removeAttribute('aria-rowindex');
        summary?.removeAttribute('aria-rowindex');
    }
    if (body && colCount) {
        body.querySelectorAll<HTMLElement>('.pdx-dg-group-row > [role="gridcell"]')
            .forEach(c => c.setAttribute('aria-colspan', String(colCount)));
    }
}

// ─── Roving tab stop ────────────────────────────────────────

/** Put the tab stop where the keyboard left it (or on the first cell), and focus back if it was in. */
export function applyRoving(gc: GridContext, grid: HTMLElement): void {
    const rows = navRows(grid);
    if (rows.length === 0) return;
    for (const row of rows) {
        for (const cell of cellsOf(row)) {
            cell.tabIndex = -1;
            cell.querySelectorAll<HTMLElement>(`[${GRID_WIDGET}]`).forEach(w => { w.tabIndex = -1; });
        }
    }
    let r = 0;
    if (gc.nav) {
        const found = rows.findIndex((row, i) => rowKey(row, i) === gc.nav!.key);
        r = found >= 0 ? found : Math.min(gc.nav.index, rows.length - 1);
    }
    const cells = cellsOf(rows[r]);
    const target = targetOf(cells[Math.min(gc.nav?.col ?? 0, cells.length - 1)]);
    target.tabIndex = 0;
    const active = document.activeElement;
    if (gc.navFocused && (!active || active === document.body || !grid.contains(active))) {
        target.focus({ preventScroll: true });
    }
}

/** Keyboard navigation and focus tracking on the grid element. Call once per grid element. */
export function setupGridNav(gc: GridContext, grid: HTMLElement): void {
    function moveTo(rows: HTMLElement[], r: number, col: number): void {
        const cells = cellsOf(rows[r]);
        const target = targetOf(cells[Math.max(0, Math.min(col, cells.length - 1))]);
        grid.querySelectorAll<HTMLElement>('[role="row"] [tabindex="0"]').forEach(n => { n.tabIndex = -1; });
        target.tabIndex = 0;
        target.focus();
        target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }

    grid.addEventListener('focusin', (e) => {
        const cell = cellOfTarget(grid, e.target as Element);
        // Focus on a filter input, or elsewhere outside a cell: a rebuild must not pull it back.
        gc.navFocused = !!cell;
        if (!cell) return;
        const rows = navRows(grid);
        const row = cell.closest('[role="row"]') as HTMLElement;
        const r = rows.indexOf(row);
        if (r < 0) return;
        const c = cellsOf(row).indexOf(cell);
        // A vertical move keeps the column it came from, even through a narrower row (a group row).
        const col = gc.nav?.pending ? gc.nav.col : c;
        gc.nav = { key: rowKey(row, r), index: r, col };
        // A click on a cell makes it the tab stop.
        const target = targetOf(cell);
        if (target.tabIndex !== 0) {
            grid.querySelectorAll<HTMLElement>('[role="row"] [tabindex="0"]').forEach(n => { n.tabIndex = -1; });
            target.tabIndex = 0;
        }
    });
    grid.addEventListener('focusout', (e) => {
        const next = (e as FocusEvent).relatedTarget as Node | null;
        if (next && grid.contains(next)) return;
        const left = e.target as Node;
        // Gone elsewhere — or removed by a rebuild, and then the rebuild puts the focus back.
        queueMicrotask(() => {
            if (left.isConnected && !grid.contains(document.activeElement)) gc.navFocused = false;
        });
    });

    grid.addEventListener('keydown', (e) => {
        if (gc.editingCell || gc.editingRowId != null) return;   // the editor's keys (grid-edit)
        const t = e.target as HTMLElement;
        const cell = cellOfTarget(grid, t);
        if (!cell || (t !== cell && !t.hasAttribute(GRID_WIDGET))) return;
        const rows = navRows(grid);
        const row = cell.closest('[role="row"]') as HTMLElement;
        const r = rows.indexOf(row);
        if (r < 0) return;
        const c = cellsOf(row).indexOf(cell);
        const want = gc.nav?.col ?? c;
        const last = rows.length - 1;
        let move: [row: number, col: number, keepCol: boolean];
        switch (e.key) {
            case 'ArrowRight': move = [r, c + 1, false]; break;
            case 'ArrowLeft': move = [r, c - 1, false]; break;
            case 'ArrowDown': move = [Math.min(r + 1, last), want, true]; break;
            case 'ArrowUp': move = [Math.max(r - 1, 0), want, true]; break;
            case 'PageDown': move = [Math.min(r + 10, last), want, true]; break;
            case 'PageUp': move = [Math.max(r - 10, 0), want, true]; break;
            case 'Home': move = e.ctrlKey ? [0, 0, false] : [r, 0, false]; break;
            case 'End': move = e.ctrlKey ? [last, cellsOf(rows[last]).length - 1, false] : [r, cellsOf(row).length - 1, false]; break;
            case 'Enter': case 'F2': {
                // Editing starts from an editable data cell, and only in an editable grid.
                if (gc.editMode() === 'none' || t !== cell || cell.getAttribute('role') !== 'gridcell') return;
                const field = cell.getAttribute('data-field');
                const col = (gc.grid?.columns.peek() as AnyColumn[] | undefined)?.find(c => c.field === field);
                if (!col || col.def.editable === false || col.def.command || col.def.compute) return;
                // The row by its id as the attribute spells it: getById(attribute) compared a string
                // with a numeric id and found nothing, so Enter never started an edit on such rows.
                const idField = gc.getIdField();
                const rowIdAttr = row.getAttribute('data-row-id');
                const data = (gc.grid?.rows.peek() as Record<string, unknown>[] | undefined)
                    ?.find(d => String(d[idField]) === rowIdAttr);
                if (!data) return;
                e.preventDefault();
                startCellEdit(gc, data[idField], col.field, getFieldValue(data, col.field));
                gc.forceUpdate();
                return;
            }
            default: return;
        }
        e.preventDefault();
        const [toRow, toCol, keepCol] = move;
        const col = Math.max(0, Math.min(toCol, cellsOf(rows[toRow]).length - 1));
        gc.nav = { key: rowKey(rows[toRow], toRow), index: toRow, col: keepCol ? want : col, pending: true };
        moveTo(rows, toRow, col);
        if (gc.nav) gc.nav.pending = false;
    });
}
