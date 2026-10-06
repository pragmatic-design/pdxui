// pdx-entity-grid — a CRUD grid: data-grid + a "New" toolbar + per-row edit/delete actions +
// a bulk-actions bar + an edit-drawer, wired together. It keeps a local optimistic copy of the
// rows (so create/update/delete reflect immediately) and emits pdx-create/pdx-update/pdx-delete so
// the parent can persist. Composes Track A (exposed grid methods), B1 (typed `actions` cell) and
// B2 (reactive `data` swap).

import { component, html, signal, computed, actions } from '@pdxui/core';
import type { ColumnDef } from '@pdxui/core';
import type { BulkAction } from '../bulk-actions/pdx-bulk-actions';
import { uiString, format } from '../shared/i18n';
// Self-contained: register every composed custom element when this entry is imported directly
// (e.g. @pdxui/ui/entity-grid), not only via the @pdxui/ui barrel.
import '../data-grid/pdx-data-grid';
import '../bulk-actions/pdx-bulk-actions';
import '../edit-drawer/pdx-edit-drawer';
import '../alert-dialog/pdx-alert-dialog';
import '../icon/pdx-icon';

type Row = Record<string, unknown>;
/** A delete waiting for the confirmation: one row's (with the row) or the selection's. */
type PendingDelete = { ids: unknown[]; row?: Row };

/** The first plain-text column, skipping the id: what names a row when `rowLabel` is not set. */
function firstTextField(cols: ColumnDef[], idField: string): string | undefined {
    for (const c of cols) {
        if (c.children?.length) {
            const f = firstTextField(c.children, idField);
            if (f) return f;
        } else if ((!c.type || c.type === 'text') && !c.command && c.field && c.field !== idField) {
            return c.field as string;
        }
    }
    return undefined;
}

/**
 * A CRUD surface over a data grid: the user creates, edits and deletes rows in a local optimistic copy,
 * and `pdx-create`, `pdx-update` and `pdx-delete` let the app persist them.
 */
component('pdx-entity-grid', {
    props: {
        /** Grid columns (ColumnDef[]). An edit/delete actions column is appended unless readonly. */
        columns: { type: Array, default: [] },
        /** Entity rows. */
        data: { type: Array, default: [] },
        /** FormSchema for the create/edit drawer. Without it the CRUD affordances are hidden. */
        schema: { type: Object, default: null },
        idField: { type: String, default: 'id' },
        title: { type: String, default: '' },
        /** The create button's text. Empty: the entity-grid.add component string, «New». */
        addLabel: { type: String, default: '' },
        selection: { type: String, default: 'multiple', enum: ['none', 'single', 'multiple'] },
        /** Show the per-row edit/delete actions column. */
        rowActions: { type: Boolean, default: true },
        /** Extra bulk actions (besides the built-in Delete). */
        bulkActions: { type: Array, default: [] },
        /** Hide all mutating affordances (view-only grid). */
        readonly: { type: Boolean, default: false },
        /** Ask before deleting ("Delete Alice Johnson?", "Delete 3 records?"). `false` for an app that
         *  confirms, or offers undo, in its pdx-delete handler: the rows go at once. */
        confirmDelete: { type: Boolean, default: true },
        /** The field that names a row in its action buttons and in the delete confirmation. Empty:
         *  the first text column, else the id. */
        rowLabel: { type: String, default: '' },
    },
    setup(ctx) {
        const rows = signal<Row[]>([]);
        const drawerOpen = signal(false);
        const editing = signal<Row | null>(null);
        const selectedIds = signal<unknown[]>([]);
        const pendingDelete = signal<PendingDelete | null>(null);
        let tempIdSeq = 0; // stable local identity for optimistic rows the parent hasn't persisted yet

        // Local optimistic mirror of `data` (new array ref each time → grid re-renders, see B2).
        ctx.track(() => { rows.set([...((ctx.data() as Row[]) ?? [])]); });

        const idOf = (r: Row | null): unknown => (r ? r[ctx.idField() as string] : undefined);
        const grid = (): { clearSelection?: () => void } | null =>
            ctx.el.querySelector('pdx-data-grid') as unknown as { clearSelection?: () => void } | null;

        // The field that names a row: rowLabel, else the first text column, else the id.
        const labelField = computed<string>(() =>
            (ctx.rowLabel() as string)
            || firstTextField((ctx.columns() as ColumnDef[]) ?? [], ctx.idField() as string)
            || (ctx.idField() as string));
        const labelOf = (row: Row, field = labelField.peek()): string => {
            const v = row[field];
            return v == null || v === '' ? String(idOf(row) ?? '') : String(v);
        };

        // user columns + a typed actions column (B1) calling back into edit/delete. Each button is
        // named after its row. A command column: no filter, resize, drag or chooser entry.
        // Its header has a name: the grid's roving focus lands on it after a delete, and an empty
        // columnheader is announced as nothing.
        const effectiveColumns = computed<ColumnDef[]>(() => {
            const cols = [...((ctx.columns() as ColumnDef[]) ?? [])];
            if (ctx.rowActions() && !ctx.readonly() && ctx.schema()) {
                const field = labelField();
                const named = (key: string) => (row: Row) => format(uiString('entity-grid', key), { label: labelOf(row, field) });
                cols.push({
                    field: '__actions', header: uiString('entity-grid', 'actions'), width: 96, command: true,
                    cell: actions([
                        { icon: 'pencil', label: named('edit'), onClick: (row) => openEdit(row as Row) },
                        { icon: 'trash', label: named('delete'), tone: 'danger', onClick: (row) => requestDelete({ ids: [idOf(row as Row)], row: row as Row }) },
                    ]),
                } as ColumnDef);
            }
            return cols;
        });

        const allBulkActions = computed<BulkAction[]>(() => {
            // readonly = truly view-only: no bulk bar at all (not even custom actions). For a
            // read grid WITH actions, omit readonly + schema and pass bulkActions instead.
            if (ctx.readonly()) return [];
            const extra = (ctx.bulkActions() as BulkAction[]) ?? [];
            return [...extra, { key: '__delete', label: uiString('entity-grid', 'bulkDelete'), icon: 'trash', tone: 'danger' }];
        });

        function openCreate(): void { editing.set(null); drawerOpen.set(true); }
        function openEdit(row: Row): void { editing.set(row); drawerOpen.set(true); }
        function closeDrawer(): void { drawerOpen.set(false); }

        // A delete asks first: otherwise a click on the trash removes the record at once, and the
        // next click — meant for a confirmation that is not there — removes another.
        function requestDelete(p: PendingDelete): void {
            if (ctx.confirmDelete()) pendingDelete.set(p);
            else commitDelete(p);
        }

        function commitDelete(p: PendingDelete): void {
            rows.set(rows.peek().filter(r => !p.ids.includes(idOf(r))));
            if (p.row) {
                ctx.emit('pdx-delete', { ids: p.ids, rows: [p.row] });
            } else {
                ctx.emit('pdx-delete', { ids: p.ids });
                clearSelection();
            }
        }

        function onDeleteConfirmed(): void {
            const p = pendingDelete.peek();
            pendingDelete.set(null);
            if (p) commitDelete(p);
        }

        function onDeleteCancelled(): void { pendingDelete.set(null); }

        /** The confirmation's title: "Delete Alice Johnson?" or "Delete 3 records?". */
        function confirmTitle(): string {
            const p = pendingDelete();
            if (!p) return '';
            return p.row
                ? format(uiString('entity-grid', 'confirmOne'), { label: labelOf(p.row) })
                : format(uiString('entity-grid', 'confirmMany'), { count: p.ids.length });
        }

        function onSave(e: CustomEvent): void {
            const { values, mode } = e.detail as { values: Row; mode: 'edit' | 'create' };
            if (mode === 'edit') {
                const id = idOf(editing.peek());
                rows.set(rows.peek().map(r => (idOf(r) === id ? { ...r, ...values } : r)));
                ctx.emit('pdx-update', { id, values });
            } else {
                // The optimistic row needs a stable local id (edit/delete/selection are keyed by
                // idField). If the form didn't supply one we mint a CLIENT-ONLY id — but we do NOT
                // leak it into the public `values`: the parent persists the clean form output and
                // gets `clientId` to correlate the server row back to this optimistic one.
                const idField = ctx.idField() as string;
                const hasId = values[idField] != null;
                const clientId = hasId ? values[idField] : `__tmp-${++tempIdSeq}`;
                const row = hasId ? values : { ...values, [idField]: clientId };
                rows.set([...rows.peek(), row]);
                ctx.emit('pdx-create', { values, clientId });
            }
            drawerOpen.set(false);
        }

        function onSelectionChange(e: CustomEvent): void {
            selectedIds.set((e.detail?.selected as unknown[]) ?? []);
        }

        function onBulkAction(e: CustomEvent): void {
            const key = (e.detail as { key: string }).key;
            const ids = selectedIds.peek();
            if (key === '__delete') {
                requestDelete({ ids: [...ids] });
            } else {
                ctx.emit('pdx-bulk', { key, ids });
            }
        }

        function clearSelection(): void {
            selectedIds.set([]);
            grid()?.clearSelection?.();
        }

        ctx.expose({
            /** Open the drawer on an empty record. */
            openCreate,
            /** Open the drawer on this row. */
            openEdit,
            /** The ids currently checked. */
            getSelectedIds() { return selectedIds.peek(); },
        });

        return {
            rows, drawerOpen, editing, selectedIds, effectiveColumns, allBulkActions, pendingDelete,
            openCreate, closeDrawer, onSave, onSelectionChange, onBulkAction, clearSelection,
            onDeleteConfirmed, onDeleteCancelled, confirmTitle,
        };
    },
    render: (ctx) => html`
        <div class="pdx-entity-grid" style="display:flex;flex-direction:column;gap:var(--pdx-space-sm)">
            <header class="pdx-entity-grid-toolbar"
                style="display:flex;align-items:center;justify-content:space-between;gap:var(--pdx-space-md)">
                <h2 class="pdx-txt-heading" style="margin:0">${ctx.title}</h2>
                <div>
                    ${() => ctx.schema() && !ctx.readonly() ? html`
                        <button type="button" size="sm" class="pdx-primary" @click="${() => ctx.openCreate()}">
                            <pdx-icon name="plus" size="16"></pdx-icon> ${() => (ctx.addLabel() as string) || uiString('entity-grid', 'add')}
                        </button>
                    ` : ''}
                </div>
            </header>

            ${() => !ctx.readonly() && (ctx.selectedIds() as unknown[]).length > 0 ? html`
                <pdx-bulk-actions :count="${() => (ctx.selectedIds() as unknown[]).length}"
                    :actions="${ctx.allBulkActions}"
                    @pdx-action="${(e: CustomEvent) => ctx.onBulkAction(e)}"
                    @pdx-clear="${() => ctx.clearSelection()}"></pdx-bulk-actions>
            ` : ''}

            <pdx-data-grid :columns="${ctx.effectiveColumns}" :data="${ctx.rows}"
                :id-field="${ctx.idField}" :selection="${ctx.selection}"
                @pdx-selection-change="${(e: CustomEvent) => ctx.onSelectionChange(e)}"></pdx-data-grid>

            ${() => ctx.schema() ? html`
                <pdx-edit-drawer :open="${ctx.drawerOpen}" :schema="${ctx.schema}" :value="${ctx.editing}"
                    @pdx-save="${(e: CustomEvent) => ctx.onSave(e)}"
                    @pdx-cancel="${() => ctx.closeDrawer()}"></pdx-edit-drawer>
            ` : ''}

            ${() => !ctx.readonly() ? html`
                <pdx-alert-dialog variant="danger" close-on-escape :open="${() => ctx.pendingDelete() !== null}"
                    :title="${ctx.confirmTitle}"
                    :confirm-label="${() => uiString('entity-grid', 'confirm')}"
                    @pdx-confirm="${() => ctx.onDeleteConfirmed()}"
                    @pdx-cancel="${() => ctx.onDeleteCancelled()}"></pdx-alert-dialog>
            ` : ''}
        </div>
    `,
});
