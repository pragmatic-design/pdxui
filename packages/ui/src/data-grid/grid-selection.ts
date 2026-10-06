// Grid selection — checkbox column, select-all, shift-range, UI update.

import type { GridContext } from './grid-context';

/**
 * Publish the selection: into the bound source when it keeps one, and out as the event.
 *
 * ONE function rather than an emit repeated at each mutation, because the source write must not be
 * something a future mutation can forget. Every place that changes `gc.selectedIds` ends here.
 *
 * The `selectionEnabled` guard is the whole of the rule: a source
 * that opted into keeping a selection gets the one the user can see — so `selectedCount()`,
 * `selectedItems()` and its persistence describe reality — while a source that never asked
 * for selection state is left exactly as it was. Feeding it unconditionally would make
 * `options.selection` mean nothing.
 *
 * `setSelected` replaces in one operation: a shift-click over 200 rows is one gesture, and through
 * `select(id)` it would be 200 notifications and 200 persistence writes.
 */
function publishSelection(gc: GridContext): void {
    const ids = Array.from(gc.selectedIds);
    const source = gc.grid?.source as { selectionEnabled?: boolean; setSelected?: (ids: unknown[]) => void } | undefined;
    if (source?.selectionEnabled && typeof source.setSelected === 'function') {
        source.setSelected(ids);
    }
    gc.emit('pdx-selection-change', { selected: ids, count: ids.length });
}

export function toggleSelect(gc: GridContext, id: unknown, shiftKey: boolean): void {
    const mode = gc.getSelectionMode();
    if (mode === 'none') return;
    const idFieldName = gc.getIdField();

    if (mode === 'single') {
        gc.selectedIds.clear();
        gc.selectedIds.add(id);
    } else {
        if (shiftKey && (gc as any).__lastClickedId != null && gc.grid) {
            const rows = gc.grid.rows.peek();
            const fromIdx = rows.findIndex((r: Record<string, unknown>) => r[idFieldName] === (gc as any).__lastClickedId);
            const toIdx = rows.findIndex((r: Record<string, unknown>) => r[idFieldName] === id);
            if (fromIdx >= 0 && toIdx >= 0) {
                const start = Math.min(fromIdx, toIdx);
                const end = Math.max(fromIdx, toIdx);
                for (let i = start; i <= end; i++) {
                    gc.selectedIds.add(rows[i][idFieldName]);
                }
            }
        } else {
            if (gc.selectedIds.has(id)) gc.selectedIds.delete(id);
            else gc.selectedIds.add(id);
        }
    }
    (gc as any).__lastClickedId = id;
    updateSelectionUI(gc);
    publishSelection(gc);
}

export function selectAll(gc: GridContext): void {
    if (!gc.grid) return;
    const idFieldName = gc.getIdField();
    const rows = gc.grid.rows.peek();
    const allSelected = rows.length > 0 && rows.every((r: Record<string, unknown>) => gc.selectedIds.has(r[idFieldName]));
    if (allSelected) {
        gc.selectedIds.clear();
    } else {
        for (const r of rows) gc.selectedIds.add((r as Record<string, unknown>)[idFieldName]);
    }
    updateSelectionUI(gc);
    publishSelection(gc);
}

/**
 * Replace the selection with exactly `ids`.
 *
 * The answer to a server that accepted nine of twelve: the three it refused stay
 * checked, so the next attempt is a click and not a re-selection. Without it the only moves an
 * application has are «keep everything» and `clearSelection`.
 *
 * An id no rendered row carries is dropped rather than held: a selection the user cannot see is
 * one they cannot undo, and it would count in the bar. In `single` mode the LAST one wins, which
 * is what clicking them in order would have done.
 */
export function setSelection(gc: GridContext, ids: unknown[]): void {
    const idFieldName = gc.getIdField();
    const known = new Set((gc.grid?.rows.peek() ?? []).map((r: Record<string, unknown>) => String(r[idFieldName])));
    const wanted = ids.filter((id) => known.has(String(id)));
    const next = gc.getSelectionMode() === 'single' ? wanted.slice(-1) : wanted;
    gc.selectedIds.clear();
    for (const id of next) gc.selectedIds.add(id);
    updateSelectionUI(gc);
    publishSelection(gc);
}

/** Clear the whole selection (used by consumer bulk-action bars after an action). */
export function clearSelection(gc: GridContext): void {
    if (gc.selectedIds.size === 0) return;
    gc.selectedIds.clear();
    updateSelectionUI(gc);
    publishSelection(gc);
}

export function updateSelectionUI(gc: GridContext, headerEl?: HTMLElement | null, bodyEl?: HTMLElement | null): void {
    // Prefer THIS instance's elements; document.querySelector would grab the first grid on the
    // page and paint the wrong one.
    const header = headerEl ?? gc.getHeaderEl?.() ?? document.querySelector('pdx-data-grid .pdx-dg-header');
    const body = bodyEl ?? gc.getBodyEl?.() ?? document.querySelector('pdx-data-grid .pdx-dg-body');
    if (!body || !header || !gc.grid) return;

    const idFieldName = gc.getIdField();
    const rows = gc.grid.rows.peek();

    // Match each row element by its own data-row-id, NOT by DOM index. Under virtual scroll the
    // rendered rows start at startIdx, so rowEls[i] ↔ rows[i] mislabels every row.
    const selStr = new Set(Array.from(gc.selectedIds, (v) => String(v)));
    const rowEls = body.querySelectorAll('.pdx-dg-row');
    rowEls.forEach((rowEl) => {
        const idAttr = rowEl.getAttribute('data-row-id');
        if (idAttr == null) return;
        const sel = selStr.has(idAttr);
        rowEl.classList.toggle('pdx-dg-row-selected', sel);
        rowEl.setAttribute('aria-selected', String(sel));
        const cb = rowEl.querySelector('.pdx-dg-checkbox input') as HTMLInputElement | null;
        if (cb) cb.checked = sel;
    });

    // Update header checkbox
    const headerCb = header.querySelector('.pdx-dg-checkbox input') as HTMLInputElement | null;
    if (headerCb && rows.length > 0) {
        const allSel = rows.every((r: Record<string, unknown>) => gc.selectedIds.has(r[idFieldName]));
        const someSel = rows.some((r: Record<string, unknown>) => gc.selectedIds.has(r[idFieldName]));
        headerCb.checked = allSel;
        headerCb.indeterminate = someSel && !allSel;
    }
}
