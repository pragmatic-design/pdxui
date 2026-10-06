// Grid body — row rendering, cell value formatting, selection checkboxes.

import type { GridContext, AnyColumn } from './grid-context';
import { applyColSize, GRID_WIDGET } from './grid-context';
import { getFieldValue } from '@pdxui/core';
import { renderExpandCell, renderDetailRow } from './grid-detail';
import { renderCellNode } from './grid-cell';
import { t } from './grid-i18n';
import { startCellEdit, commitCellEdit, cancelCellEdit, createDefaultEditor, startRowEdit, commitRowEdit, cancelRowEdit, deleteRow, openEditDialog, readCellEditorValue } from './grid-edit';

// A per-grid identity token used by the row reorder: the drag's dataTransfer
// must identify the grid it came from so cross-grid drops can be refused.
let _reorderSeq = 0;
const _reorderTokens = new WeakMap<object, string>();
function reorderTokenFor(gc: object): string {
    let t = _reorderTokens.get(gc);
    if (!t) {
        t = `pdx-dg-${++_reorderSeq}`;
        _reorderTokens.set(gc, t);
    }
    return t;
}

export function renderRows(
    gc: GridContext,
    container: HTMLElement,
    rows: Record<string, unknown>[],
    cols: AnyColumn[],
    /** If true, don't clear the container (used by grouping to append after group header). */
    append = false,
): void {
    if (!append) container.innerHTML = '';
    const visibleCols = cols.filter(c => c.visible);
    const idFieldName = gc.getIdField();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowEl = document.createElement('div');
        rowEl.className = 'pdx-dg-row';
        // The consumer's own mark on the row. Before the selection and the drag
        // classes, so a `pdx-dg-row-selected` still wins where they overlap.
        const rowClass = gc.getRowClass?.(row, i);
        if (rowClass) rowEl.classList.add(...rowClass.split(' ').filter(Boolean));
        rowEl.setAttribute('role', 'row');
        rowEl.setAttribute('data-row-index', String(i));
        const rowId = row[idFieldName];
        if (rowId != null) rowEl.setAttribute('data-row-id', String(rowId));

        // Drag-to-reorder (opt-in via `row-reorder`; non-virtual grids). Emits pdx-row-reorder {from,to,...};
        // the consumer reorders the underlying data (the grid does not mutate the source itself).
        // NOTE: from/to are indexes relative to the CURRENT PAGE — with pagination use
        // fromId/toId to reorder the complete dataset.
        if (gc.isRowReorder()) {
            rowEl.setAttribute('draggable', 'true');
            rowEl.classList.add('pdx-dg-row-draggable');
            const fromIndex = i;
            const gridToken = reorderTokenFor(gc);
            rowEl.addEventListener('dragstart', (e) => {
                // The token identifies the grid: a drop coming from ANOTHER grid
                // must not emit a reorder with an index that is not ours.
                (e as DragEvent).dataTransfer?.setData('text/plain', JSON.stringify({ g: gridToken, from: fromIndex }));
                rowEl.classList.add('pdx-dg-row-dragging');
            });
            rowEl.addEventListener('dragend', () => rowEl.classList.remove('pdx-dg-row-dragging'));
            rowEl.addEventListener('dragover', (e) => { e.preventDefault(); rowEl.classList.add('pdx-dg-row-dragover'); });
            rowEl.addEventListener('dragleave', () => rowEl.classList.remove('pdx-dg-row-dragover'));
            rowEl.addEventListener('drop', (e) => {
                e.preventDefault();
                rowEl.classList.remove('pdx-dg-row-dragover');
                let from = NaN;
                try {
                    const payload = JSON.parse((e as DragEvent).dataTransfer?.getData('text/plain') ?? '');
                    if (payload && payload.g === gridToken) from = Number(payload.from);
                } catch { /* a payload that is not ours (a drag from outside) → ignore it */ }
                if (!Number.isNaN(from) && from !== fromIndex) {
                    gc.emit('pdx-row-reorder', { from, to: fromIndex, fromId: rows[from]?.[idFieldName], toId: rowId });
                }
            });
        }

        // Selection highlight, and the state a screen reader reads
        if (gc.getSelectionMode() !== 'none') {
            const selected = gc.selectedIds.has(rowId);
            if (selected) rowEl.classList.add('pdx-dg-row-selected');
            rowEl.setAttribute('aria-selected', String(selected));
        }

        // Expand chevron cell (before checkbox)
        if (gc.isExpandable()) {
            rowEl.appendChild(renderExpandCell(gc, rowId));
        }

        // Checkbox cell
        if (gc.getSelectionMode() !== 'none') {
            const checkCell = document.createElement('div');
            checkCell.className = 'pdx-dg-td pdx-dg-checkbox';
            checkCell.setAttribute('role', 'gridcell');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.setAttribute(GRID_WIDGET, '');
            cb.checked = gc.selectedIds.has(rowId);
            cb.setAttribute('aria-label', t('selectRow').replace('{n}', String(i + 1)));
            cb.addEventListener('change', (e) => {
                gc.emit('__toggle-select', { id: rowId, row, shiftKey: (e as any).shiftKey ?? false });
            });
            cb.addEventListener('click', (e) => e.stopPropagation());
            // The cell is the checkbox's hit area: a click beside the box toggles it, and never
            // reaches the row — there it would emit `pdx-row-click`, and the page would open the record.
            checkCell.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target !== cb) cb.click();
            });
            checkCell.appendChild(cb);
            rowEl.appendChild(checkCell);
        }

        for (const col of visibleCols) {
            const td = document.createElement('div');
            td.className = 'pdx-dg-td';
            if (col.def.command) td.classList.add('pdx-dg-td-command');
            if (col.align === 'right') td.classList.add('pdx-dg-td-right');
            else if (col.align === 'center') td.classList.add('pdx-dg-td-center');
            applyColSize(td, col);
            td.setAttribute('role', 'gridcell');
            td.setAttribute('data-field', col.field);

            let value: unknown;
            if (col.def.compute) {
                value = col.def.compute(row);
            } else {
                value = getFieldValue(row, col.field);
            }

            const isEditMode = gc.editMode() !== 'none';
            const isCellEditing = gc.editingCell?.rowId === rowId && gc.editingCell?.field === col.field;
            const isRowEditing = gc.editingRowId === rowId;
            const isColEditable = col.def.editable !== false && !col.def.command && !col.def.compute;

            if (isCellEditing && isColEditable) {
                // Cell edit mode — show editor for this cell
                const editSlot = gc.getSlot(`col-edit:${col.field}`);
                if (editSlot) {
                    td.appendChild(editSlot({ row, value, col, form: gc.editForm }));
                } else {
                    let editVal = value;
                    td.appendChild(createDefaultEditor(col, value,
                        (val) => { editVal = val; },
                        () => { commitCellEdit(gc, editVal); },
                        () => { cancelCellEdit(gc); },
                    ));
                }
                td.classList.add('pdx-dg-cell-editing');
                // Auto-focus editor
                requestAnimationFrame(() => {
                    const input = td.querySelector('input, pdx-input, pdx-number-input, pdx-select, pdx-date-picker') as HTMLElement | null;
                    if (input) (input.querySelector?.('input') ?? input).focus?.();
                });
            } else if (isRowEditing && isColEditable) {
                // Row edit mode — all editable cells become editors
                const fieldObj = gc.editForm?.fields?.[col.field];
                td.appendChild(createDefaultEditor(col, value,
                    (val) => { fieldObj?.onChange(val); },
                    () => { commitRowEdit(gc); },
                    () => { cancelRowEdit(gc); },
                ));
                td.classList.add('pdx-dg-cell-editing');
            } else if (isRowEditing && col.def.command) {
                // Command column during row edit — show Save/Cancel
                const actions = document.createElement('div');
                actions.className = 'pdx-dg-edit-actions';
                const saveBtn = document.createElement('pdx-button') as any;
                saveBtn.setAttribute('size', 'xs');
                saveBtn.setAttribute('variant', 'primary');
                saveBtn.textContent = t('edit.save');
                saveBtn.addEventListener('click', (e: Event) => { e.stopPropagation(); commitRowEdit(gc); });
                const cancelBtn = document.createElement('pdx-button') as any;
                cancelBtn.setAttribute('size', 'xs');
                cancelBtn.setAttribute('variant', 'ghost');
                cancelBtn.textContent = t('edit.cancel');
                cancelBtn.addEventListener('click', (e: Event) => { e.stopPropagation(); cancelRowEdit(gc); });
                actions.appendChild(saveBtn);
                actions.appendChild(cancelBtn);
                td.appendChild(actions);
            } else {
                // Display mode — use batch value if dirty, else original
                let displayValue = value;
                if (gc.editMode() === 'batch' && gc.batchChanges.has(rowId)) {
                    const changes = gc.batchChanges.get(rowId);
                    if (changes && col.field in changes) displayValue = changes[col.field];
                }

                // Normal display — boolean shows ✓/✗ (read-only)
                {
                    const cellSlot = gc.getSlot(`col:${col.field}`);
                    if (cellSlot) {
                        const content = cellSlot({ row, value: displayValue, index: i, col });
                        td.appendChild(content instanceof DocumentFragment ? content : content);
                    } else {
                        td.appendChild(renderCellNode(displayValue, col, row));
                    }
                }

                // Double-click to start cell edit (all editable types including boolean)
                if (isEditMode && isColEditable && (gc.editMode() === 'cell' || gc.editMode() === 'batch')) {
                    td.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        startCellEdit(gc, rowId, col.field, displayValue);
                        gc.forceUpdate();
                    });
                    td.style.cursor = 'cell';
                }

                // Command column: auto-render Edit/Delete if no slot and editable
                if (col.def.command && isEditMode && !gc.getSlot(`col:${col.field}`)) {
                    const actions = document.createElement('div');
                    actions.className = 'pdx-dg-edit-actions';
                    const editBtn = document.createElement('pdx-button') as any;
                    editBtn.setAttribute('size', 'xs');
                    editBtn.textContent = t('edit.edit');
                    editBtn.addEventListener('click', (e: Event) => {
                        e.stopPropagation();
                        if (gc.editMode() === 'dialog') openEditDialog(gc, rowId);
                        else startRowEdit(gc, rowId);
                    });
                    const delBtn = document.createElement('pdx-button') as any;
                    delBtn.setAttribute('size', 'xs');
                    delBtn.setAttribute('variant', 'danger');
                    delBtn.textContent = t('edit.delete');
                    delBtn.addEventListener('click', (e: Event) => { e.stopPropagation(); deleteRow(gc, rowId); });
                    actions.appendChild(editBtn);
                    actions.appendChild(delBtn);
                    td.appendChild(actions);
                }
            }

            // Batch mode: highlight dirty cells
            if (gc.editMode() === 'batch' && gc.batchChanges.has(rowId)) {
                const changes = gc.batchChanges.get(rowId);
                if (changes && col.field in changes) {
                    td.classList.add('pdx-dg-cell-dirty');
                }
            }

            if (col.def.cellClass) {
                const cls = typeof col.def.cellClass === 'function'
                    ? col.def.cellClass(value, row)
                    : col.def.cellClass;
                if (cls) td.classList.add(...cls.split(' '));
            }

            rowEl.appendChild(td);
        }

        rowEl.addEventListener('click', () => {
            gc.emit('pdx-row-click', { row, index: i, id: rowId });
        });

        container.appendChild(rowEl);

        // Detail row (expanded)
        if (gc.isExpandable()) {
            const detailEl = renderDetailRow(gc, row, i, rowId);
            if (detailEl) container.appendChild(detailEl);
        }
    }

    // Click ANYWHERE outside editing cell → commit and exit edit
    if (gc.editingCell && !append) {
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const editingTd = container.querySelector('.pdx-dg-cell-editing');
            if (!editingTd || editingTd.contains(target)) return;

            document.removeEventListener('pointerdown', handler, true);
            // Read current value from the editor before committing — the same reader as the keyboard.
            const val = readCellEditorValue(editingTd);
            if (val !== undefined) {
                commitCellEdit(gc, val);
            } else {
                cancelCellEdit(gc);
            }
        };
        // Listen on document (capture) — catches clicks on other cells, outside grid, header, etc.
        requestAnimationFrame(() => {
            document.addEventListener('pointerdown', handler, true);
        });
    }
}

