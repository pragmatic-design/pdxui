// Grid edit mode — cell, row, dialog, batch editing.
// Uses DataSource CRUD (add/update/remove/patch/sync) for persistence.
// Default editors auto-created from column type; custom via col-edit:{field} slot.

import type { GridContext, AnyColumn } from './grid-context';
import { columnsToFormFields, createEditForm } from '@pdxui/core';
import { getFieldValue } from '@pdxui/core';
import { t } from './grid-i18n';

// ─── Edit Cell State ───────────────────────────────────────

export interface EditCellState {
    rowId: unknown;
    field: string;
    originalValue: unknown;
}

// ─── Cell Edit ─────────────────────────────────────────────

export function startCellEdit(gc: GridContext, rowId: unknown, field: string, value: unknown): void {
    // Cancel any existing edit
    if (gc.editingCell) cancelCellEdit(gc);
    if (gc.editingRowId != null) cancelRowEdit(gc);

    gc.editingCell = { rowId, field, originalValue: value };
    gc.emit('pdx-cell-edit-start', { rowId, field, value });
}

export function commitCellEdit(gc: GridContext, newValue: unknown): void {
    if (!gc.editingCell || !gc.grid) return;
    const { rowId, field, originalValue } = gc.editingCell;

    // Skip if unchanged
    if (Object.is(newValue, originalValue)) {
        cancelCellEdit(gc);
        return;
    }

    if (gc.editMode() === 'batch') {
        // Batch: accumulate in batchChanges, don't touch DataSource yet
        batchUpdate(gc, rowId, field, newValue);
    } else {
        // Immediate: patch + sync
        gc.grid.source.patch(rowId, { [field]: newValue });
        gc.grid.source.sync();
    }

    gc.editingCell = null;
    gc.emit('pdx-cell-edit-end', { rowId, field, oldValue: originalValue, newValue });
    gc.forceUpdate();
}

/** Toggle boolean cell directly — no double-click/editor needed. */
export function toggleBooleanCell(gc: GridContext, rowId: unknown, field: string, currentValue: unknown): void {
    if (!gc.grid) return;
    const newValue = !currentValue;

    if (gc.editMode() === 'batch') {
        batchUpdate(gc, rowId, field, newValue);
    } else {
        gc.grid.source.patch(rowId, { [field]: newValue });
        gc.grid.source.sync();
    }

    gc.emit('pdx-cell-edit-end', { rowId, field, oldValue: currentValue, newValue });
    gc.forceUpdate();
}

export function cancelCellEdit(gc: GridContext): void {
    if (!gc.editingCell) return;
    const { rowId, field } = gc.editingCell;
    gc.editingCell = null;
    gc.emit('pdx-cell-edit-cancel', { rowId, field });
    gc.forceUpdate();
}

// ─── Row Edit ──────────────────────────────────────────────

export function startRowEdit(gc: GridContext, rowId: unknown): void {
    if (!gc.grid) return;
    // Cancel any existing edit
    if (gc.editingCell) cancelCellEdit(gc);
    if (gc.editingRowId != null) cancelRowEdit(gc);

    const row = gc.grid.source.getById(rowId) as Record<string, unknown>;
    if (!row) return;

    gc.editingRowId = rowId;

    // Create form from editable columns
    const cols = gc.grid.columns.peek();
    gc.editForm = createEditForm(cols, row);

    gc.emit('pdx-row-edit-start', { rowId, row });
    gc.forceUpdate();
}

export function commitRowEdit(gc: GridContext): void {
    if (gc.editingRowId == null || !gc.grid || !gc.editForm) return;

    // Validate
    const form = gc.editForm;
    const valid = form.valid.peek();
    if (!valid) {
        // Touch all fields to show errors
        form.validate();
        gc.forceUpdate();
        return;
    }

    const values = form.getValues();
    gc.grid.source.update({ ...gc.grid.source.getById(gc.editingRowId), ...values } as any);

    if (gc.editMode() !== 'batch') {
        gc.grid.source.sync();
    }

    const rowId = gc.editingRowId;
    gc.editingRowId = null;
    gc.editForm?.dispose();
    gc.editForm = null;
    gc.emit('pdx-row-edit-end', { rowId, values });
    gc.forceUpdate();
}

export function cancelRowEdit(gc: GridContext): void {
    if (gc.editingRowId == null) return;
    const rowId = gc.editingRowId;
    gc.editingRowId = null;
    gc.editForm?.dispose();
    gc.editForm = null;
    gc.emit('pdx-row-edit-cancel', { rowId });
    gc.forceUpdate();
}

// ─── Dialog Edit ───────────────────────────────────────────

export function openEditDialog(gc: GridContext, rowId: unknown): void {
    if (!gc.grid) return;
    const row = gc.grid.source.getById(rowId) as Record<string, unknown>;
    if (!row) return;

    const cols = gc.grid.columns.peek();
    const form = createEditForm(cols, row);

    // Build dialog DOM
    const dialog = document.createElement('pdx-dialog') as any;
    dialog.setAttribute('title', t('edit.dialogTitle'));
    dialog.setAttribute('size', 'md');

    const formEl = document.createElement('div');
    formEl.style.display = 'flex';
    formEl.style.flexDirection = 'column';
    // No gap: each pdx-form-field leaves --pdx-form-field-gap below itself.
    formEl.style.padding = 'var(--pdx-space-md)';

    // Build form fields from columns
    const editableFields = columnsToFormFields(cols);
    for (const fieldSchema of editableFields) {
        const formField = document.createElement('pdx-form-field') as any;
        formField.setAttribute('label', fieldSchema.label || fieldSchema.name);
        if (fieldSchema.required) formField.setAttribute('required', '');

        const editor = createDefaultEditor(
            cols.find((c: AnyColumn) => c.field === fieldSchema.name)!,
            row[fieldSchema.name],
            (val: unknown) => {
                form.fields[fieldSchema.name]?.onChange(val);
            },
            () => {},
            () => {},
        );
        formField.appendChild(editor);
        formEl.appendChild(formField);
    }

    dialog.appendChild(formEl);

    // Footer buttons
    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.gap = 'var(--pdx-space-sm)';
    footer.style.justifyContent = 'flex-end';
    footer.style.padding = '0 var(--pdx-space-md) var(--pdx-space-md)';

    const cancelBtn = document.createElement('pdx-button') as any;
    cancelBtn.setAttribute('variant', 'ghost');
    cancelBtn.textContent = t('edit.cancel');
    cancelBtn.addEventListener('click', () => {
        form.dispose();
        dialog.remove();
    });

    const saveBtn = document.createElement('pdx-button') as any;
    saveBtn.setAttribute('variant', 'primary');
    saveBtn.textContent = t('edit.save');
    saveBtn.addEventListener('click', async () => {
        const isValid = await form.validate();
        if (!isValid) return;

        const values = form.getValues();
        gc.grid!.source.update({ ...row, ...values } as any);
        gc.grid!.source.sync();
        form.dispose();
        dialog.remove();
        gc.emit('pdx-row-edit-end', { rowId, values });
        gc.forceUpdate();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    dialog.appendChild(footer);

    document.body.appendChild(dialog);
    requestAnimationFrame(() => dialog.setAttribute('open', ''));
}

// ─── Batch Operations ──────────────────────────────────────

export function batchUpdate(gc: GridContext, rowId: unknown, field: string, value: unknown): void {
    if (!gc.batchChanges.has(rowId)) {
        gc.batchChanges.set(rowId, {});
    }
    (gc.batchChanges.get(rowId) as Record<string, unknown>)[field] = value;
}

export function commitBatch(gc: GridContext): void {
    if (!gc.grid) return;

    for (const [rowId, changes] of gc.batchChanges) {
        const row = gc.grid.source.getById(rowId) as Record<string, unknown>;
        if (row) {
            gc.grid.source.update({ ...row, ...changes } as any);
        }
    }
    gc.grid.source.sync();
    // Counted before the clear: read after it, the event would always say 0.
    const count = gc.batchChanges.size;
    gc.batchChanges.clear();
    gc.emit('pdx-batch-commit', { count });
    gc.forceUpdate();
}

export function revertBatch(gc: GridContext): void {
    if (!gc.grid) return;
    gc.grid.source.cancelChanges();
    gc.batchChanges.clear();
    gc.emit('pdx-batch-revert', {});
    gc.forceUpdate();
}

// ─── Add / Delete Rows ─────────────────────────────────────

let _autoId = -1; // negative IDs for new rows (won't conflict with server IDs)

export function addRow(gc: GridContext): void {
    if (!gc.grid) return;
    const idField = gc.getIdField();
    const cols = gc.grid.columns.peek();
    const newRow: Record<string, unknown> = {};
    newRow[idField] = _autoId--;
    for (const col of cols) {
        if (!col.def.command && !col.def.compute && col.field !== idField) {
            newRow[col.field] = col.type === 'boolean' ? false : col.type === 'number' || col.type === 'currency' ? 0 : '';
        }
    }
    gc.grid.source.add(newRow as any);
    gc.forceUpdate();

    const id = newRow[idField];
    if (gc.editMode() === 'dialog') {
        openEditDialog(gc, id);
    } else if (gc.editMode() === 'row') {
        requestAnimationFrame(() => startRowEdit(gc, id));
    }
}

export function deleteRow(gc: GridContext, rowId: unknown): void {
    if (!gc.grid) return;
    const row = gc.grid.source.getById(rowId);
    if (!row) return;

    gc.grid.source.remove(row);
    if (gc.editMode() !== 'batch') {
        gc.grid.source.sync();
    }
    gc.emit('pdx-row-delete', { rowId, row });
    gc.forceUpdate();
}

// ─── Default Editor Factory ────────────────────────────────

export function createDefaultEditor(
    col: AnyColumn,
    value: unknown,
    onChange: (val: unknown) => void,
    _onCommit: () => void,
    onCancel: () => void,
): HTMLElement {
    const colType = col.type;
    let editor: HTMLElement;

    if (colType === 'boolean') {
        // Checkbox wrapper — centered, visible in all themes
        const wrap = document.createElement('label');
        wrap.className = 'pdx-dg-bool-editor';
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.justifyContent = 'center';
        wrap.style.height = '100%';
        wrap.style.cursor = 'pointer';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!value;
        cb.style.width = '18px';
        cb.style.height = '18px';
        cb.style.accentColor = 'var(--pdx-color-primary)';
        cb.addEventListener('change', () => {
            onChange(cb.checked);
            // Don't commit — user can toggle multiple times, save on click-outside
        });
        wrap.appendChild(cb);
        editor = wrap;
    } else if (colType === 'number' || colType === 'currency') {
        const input = document.createElement('pdx-number-input') as any;
        input.size = 'sm';
        input.controls = 'none';
        if (col.def.editorProps) {
            for (const [k, v] of Object.entries(col.def.editorProps)) {
                (input as any)[k] = v;
            }
        }
        requestAnimationFrame(() => { input.value = value != null ? Number(value) : null; });
        input.addEventListener('pdx-change', (e: any) => onChange(e.detail?.value));
        editor = input;
    } else if (colType === 'date') {
        const input = document.createElement('pdx-date-picker') as any;
        input.size = 'sm';
        requestAnimationFrame(() => { if (value) input.value = value; });
        input.addEventListener('pdx-change', (e: any) => onChange(e.detail?.value));
        editor = input;
    } else if (colType === 'enum' && col.def.filterOptions) {
        const select = document.createElement('pdx-select') as any;
        select.size = 'sm';
        requestAnimationFrame(() => {
            select.options = col.def.filterOptions;
            select.value = value;
        });
        select.addEventListener('pdx-change', (e: any) => onChange(e.detail?.value));
        editor = select;
    } else {
        // Default: text input
        const input = document.createElement('pdx-input') as any;
        input.size = 'sm';
        requestAnimationFrame(() => { input.value = value != null ? String(value) : ''; });
        input.addEventListener('pdx-input', (e: any) => onChange(e.detail?.value ?? input.value));
        editor = input;
    }

    // Keyboard: Escape cancels (Tab/Enter handled by grid-level handler)
    editor.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    });

    return editor;
}

// ─── Keyboard Navigation ───────────────────────────────────

/** Get editable columns in visible order. */
function getEditableCols(gc: GridContext): AnyColumn[] {
    if (!gc.grid) return [];
    return gc.grid.columns.peek().filter(
        (c: AnyColumn) => c.visible && c.def.editable !== false && !c.def.command && !c.def.compute
    );
}

/** Get all row IDs in current order. */
function getRowIds(gc: GridContext): unknown[] {
    if (!gc.grid) return [];
    const idField = gc.getIdField();
    return gc.grid.rows.peek().map((r: Record<string, unknown>) => r[idField]);
}

/** Find next editable cell: returns { rowId, field } or null. */
function findNextCell(gc: GridContext, currentRowId: unknown, currentField: string, direction: 'next' | 'prev'): { rowId: unknown; field: string } | null {
    const cols = getEditableCols(gc);
    const rowIds = getRowIds(gc);
    if (!cols.length || !rowIds.length) return null;

    const colIdx = cols.findIndex(c => c.field === currentField);
    const rowIdx = rowIds.indexOf(currentRowId);
    if (colIdx === -1 || rowIdx === -1) return null;

    if (direction === 'next') {
        // Next column in same row
        if (colIdx + 1 < cols.length) return { rowId: currentRowId, field: cols[colIdx + 1].field };
        // First column in next row
        if (rowIdx + 1 < rowIds.length) return { rowId: rowIds[rowIdx + 1], field: cols[0].field };
    } else {
        // Previous column in same row
        if (colIdx - 1 >= 0) return { rowId: currentRowId, field: cols[colIdx - 1].field };
        // Last column in previous row
        if (rowIdx - 1 >= 0) return { rowId: rowIds[rowIdx - 1], field: cols[cols.length - 1].field };
    }
    return null;
}

/** Find same column in next/prev row. */
function findNextRow(gc: GridContext, currentRowId: unknown, currentField: string, direction: 'down' | 'up'): { rowId: unknown; field: string } | null {
    const rowIds = getRowIds(gc);
    const rowIdx = rowIds.indexOf(currentRowId);
    if (rowIdx === -1) return null;

    if (direction === 'down' && rowIdx + 1 < rowIds.length) return { rowId: rowIds[rowIdx + 1], field: currentField };
    if (direction === 'up' && rowIdx - 1 >= 0) return { rowId: rowIds[rowIdx - 1], field: currentField };
    return null;
}

/**
 * The value in a cell's editor, or undefined when the cell holds none — the one reader for the
 * keyboard commit and the click-outside commit.
 *
 * The first editor in document order: a pdx-* host comes before the native control it renders,
 * and a host's `value` is its live value. A native control is read by its type:
 * `checked` only for a checkbox or radio — `checked` exists on every <input>, false on a text one,
 * and reading it for all of them would save a slot editor's typed text as `false`.
 */
export function readCellEditorValue(editingTd: Element): unknown {
    const editor = editingTd.querySelector<HTMLElement>(
        'pdx-input, pdx-number-input, pdx-select, pdx-date-picker, input, select, textarea',
    );
    if (!editor) return undefined;
    if (editor instanceof HTMLInputElement) {
        if (editor.type === 'checkbox' || editor.type === 'radio') return editor.checked;
        if (editor.type === 'number') return editor.value === '' ? null : editor.valueAsNumber;
        return editor.value;
    }
    if (editor instanceof HTMLSelectElement || editor instanceof HTMLTextAreaElement) return editor.value;
    return (editor as HTMLElement & { value?: unknown }).value ?? '';
}

/** Read the current editor value from the editing cell DOM. */
function readEditorValue(gridEl: HTMLElement): unknown {
    const editingTd = gridEl.querySelector('.pdx-dg-cell-editing');
    if (!editingTd) return undefined;
    return readCellEditorValue(editingTd);
}

/** Commit current edit and move to another cell. */
function commitAndMove(gc: GridContext, gridEl: HTMLElement, target: { rowId: unknown; field: string }): void {
    const val = readEditorValue(gridEl);
    if (val !== undefined && gc.editingCell) {
        commitCellEdit(gc, val);
    }
    // Start editing the target cell
    const row = gc.grid?.source.getById(target.rowId) as Record<string, unknown>;
    if (row) {
        startCellEdit(gc, target.rowId, target.field, getFieldValue(row, target.field));
        gc.forceUpdate();
    }
}

/** Attach the editor's keyboard handler (Tab/Enter commit and move) to the grid element. Call once during grid setup. */
export function setupGridKeyboard(gc: GridContext, gridEl: HTMLElement): () => void {
    const handler = (e: KeyboardEvent) => {
        const mode = gc.editMode();
        if (mode === 'none') return;
        // Handled below this element — the Enter that just started this edit, in grid-a11y, must not
        // also commit it and move down a row.
        if (e.defaultPrevented) return;

        // ─── While editing a cell ───
        if (gc.editingCell) {
            const { rowId, field } = gc.editingCell;

            if (e.key === 'Tab') {
                e.preventDefault();
                const next = findNextCell(gc, rowId, field, e.shiftKey ? 'prev' : 'next');
                if (next) {
                    commitAndMove(gc, gridEl, next);
                } else {
                    // No more cells — just commit
                    const val = readEditorValue(gridEl);
                    if (val !== undefined) commitCellEdit(gc, val);
                }
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const next = findNextRow(gc, rowId, field, 'down');
                if (next) {
                    commitAndMove(gc, gridEl, next);
                } else {
                    const val = readEditorValue(gridEl);
                    if (val !== undefined) commitCellEdit(gc, val);
                }
                return;
            }
            return; // other keys pass through to editor
        }
        // Not editing: moving between cells, and Enter/F2 to start, are grid-a11y's (setupGridNav) —
        // for every grid, not only an editable one.
    };

    gridEl.addEventListener('keydown', handler);
    return () => gridEl.removeEventListener('keydown', handler);
}
