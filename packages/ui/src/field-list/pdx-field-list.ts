// pdx-field-list — Manages an array of objects in a form.
// Each array item gets its own set of form fields at dotted paths (items.0.product, items.1.qty).
// Supports add/remove with automatic re-indexing of field signals.
//
// Display modes:
//   - inline (default): table of editable rows
//   - dialog: read-only summary table + dialog for add/edit
//
// Usage:
//   <pdx-field-list name="items" :form="orderForm"
//       :item-fields="[{ name: 'product', type: 'text', label: 'Product' }]"
//       :item-default="{ product: '', qty: 1, price: 0 }" />

import { component, html, signal, tryUseForm, useFieldGroupPath, FORM_INTERNALS, registerComponentStrings, getComponentString, required } from '@pdxui/core';
import type { Form, FormInternals, SlotFunction, Validator } from '@pdxui/core';
// This component's styles live in form.css — written where the
// container is rather than where the component is. Imported explicitly so they travel anyway.
import '@pdxui/design/components/form';

// Register default English strings (overridable via setComponentStrings/setLocaleStrings)
registerComponentStrings('field-list', {
    add: '+ Add',
    remove: 'Remove',
    edit: 'Edit',
    done: 'Done',
    empty: 'No items',
    editItem: 'Edit Item',
    addItem: 'Add Item',
    editItemN: 'Edit Item #{n}',
    // The tooltip of a summary cell in display="dialog". Not `edit`: that is the button.
    cellHint: 'Click to edit',
});

// Field type → component tag (subset of form-template TYPE_TAG)
const TYPE_TAG: Record<string, string> = {
    text: 'pdx-input', email: 'pdx-input', number: 'pdx-number-input',
    textarea: 'pdx-textarea', select: 'pdx-select',
    checkbox: 'pdx-checkbox', switch: 'pdx-switch',
};

const CHECKED_TYPES = new Set(['checkbox', 'switch']);

export interface FieldListItemSchema {
    name: string;
    type?: string;
    label?: string;
    placeholder?: string;
    required?: boolean;
}

/**
 * An array of objects in a form, one row per item: adding or removing a row re-indexes the fields,
 * and the values come back as an array.
 *
 * @slot row - Scoped — renders one row. Receives `{ item, index, fields, remove }` (`item` holds that row's values; `remove()` removes the row, for a row that draws its own button — the list also draws its remove button after the slot's content).
 */
component('pdx-field-list', {
    props: {
        /** Array field name in the form (e.g., 'items'). */
        name: { type: String, default: '' },
        /** Optional label rendered above the list. */
        label: { type: String, default: '' },
        /** Form instance. If not provided, uses form context. */
        form: { type: Object, default: null },
        /** Field definitions per array item. Builds one plain control per `type` — text, email, number, textarea, checkbox, switch (a `select` gets no options; anything else is a text input). A row that needs a component of its own, a picker or a select with options, goes in the `row` slot. */
        itemFields: { type: Array, default: [] },
        /** Default values for a new item. */
        itemDefault: { type: Object, default: null },
        /** Minimum number of items (default: 0). */
        minItems: { type: Number, default: 0 },
        /** Maximum number of items (default: 999). */
        maxItems: { type: Number, default: 999 },
        /** Label for the add button. Empty: the `field-list.add` component string ("+ Add" in English). */
        addLabel: { type: String, default: '' },
        /** Allow removing items (default: true). */
        removable: { type: Boolean, default: true },
        /** Display mode: inline (default), dialog. */
        display: { type: String, default: 'inline' },
    },
    setup(ctx) {
        // The context form is looked up when read, and kept once found: set up before its
        // <pdx-form>, a one-time lookup at setup would never find it. See tryUseForm(from).
        let formCtx: Form<any> | undefined;

        function getForm(): Form<any> | null {
            return (ctx.form() as Form<any>) || (formCtx ??= tryUseForm(ctx.el) as Form<any> | undefined) || null;
        }

        function getInternals(): FormInternals | null {
            const f = getForm();
            return f ? (f as any)[FORM_INTERNALS] as FormInternals : null;
        }

        function getArrayPath(): string {
            const name = ctx.name() as string;
            // The enclosing field-group's path, read when used.
            const groupPath = useFieldGroupPath(ctx.el);
            return groupPath ? `${groupPath}.${name}` : name;
        }

        // Track item count via signal
        const _itemCount = signal(0);

        // Dialog state for display="dialog"
        const _editingIndex = signal<number | null>(null);
        const _dialogOpen = signal(false);

        /**
         * The validators a row field's schema asks for. `required` on `FieldListItemSchema` is
         * enforced: a form that says a value is mandatory and then saves without it is worse than
         * one that never asked.
         */
        function validatorsFor(field: FieldListItemSchema): Validator<unknown>[] {
            return field.required ? [required() as Validator<unknown>] : [];
        }

        /** Attach the row schema's rules to the fields of the rows that already exist. */
        function registerExistingValidators(count: number): void {
            const internals = getInternals();
            if (!internals) return;
            const prefix = getArrayPath();
            const fields = ctx.itemFields() as FieldListItemSchema[];
            for (const field of fields) {
                const validators = validatorsFor(field);
                if (validators.length === 0) continue;
                // `addField` keeps the value of a field it already knows and registers the
                // validators either way, so this cannot overwrite what a row already holds.
                for (let i = 0; i < count; i++) {
                    internals.addField(`${prefix}.${i}.${field.name}`, '', validators);
                }
            }
        }

        function syncItemCount(): void {
            const internals = getInternals();
            if (!internals) return;
            const prefix = getArrayPath();
            const paths = internals.getFieldPaths();
            let maxIdx = -1;
            const prefixDot = prefix + '.';
            for (const p of paths) {
                if (p.startsWith(prefixDot)) {
                    const rest = p.slice(prefixDot.length);
                    const idx = parseInt(rest.split('.')[0], 10);
                    if (!isNaN(idx) && idx > maxIdx) maxIdx = idx;
                }
            }
            _itemCount.set(maxIdx + 1);
            registerExistingValidators(maxIdx + 1);
        }

        setTimeout(syncItemCount, 0);

        function addItem(): void {
            const internals = getInternals();
            if (!internals) return;
            const count = _itemCount.peek();
            const max = ctx.maxItems() as number;
            if (count >= max) return;

            const prefix = getArrayPath();
            const itemDef = ctx.itemDefault() as Record<string, unknown> | null;
            const fields = ctx.itemFields() as FieldListItemSchema[];

            for (const field of fields) {
                const defaultVal = itemDef?.[field.name] ?? '';
                internals.addField(`${prefix}.${count}.${field.name}`, defaultVal, validatorsFor(field));
            }
            _itemCount.set(count + 1);

            // In dialog mode, open dialog for the new item
            if ((ctx.display() as string) === 'dialog') {
                _editingIndex.set(count);
                _dialogOpen.set(true);
            }
        }

        function removeItem(index: number): void {
            const internals = getInternals();
            if (!internals) return;
            const count = _itemCount.peek();
            const min = ctx.minItems() as number;
            if (count <= min) return;

            const prefix = getArrayPath();
            internals.removeFields(`${prefix}.${index}`);
            for (let i = index + 1; i < count; i++) {
                internals.renameFields(`${prefix}.${i}`, `${prefix}.${i - 1}`);
            }
            _itemCount.set(count - 1);
        }

        function editItem(index: number): void {
            _editingIndex.set(index);
            _dialogOpen.set(true);
        }

        // The dialog's Escape handler, component-scoped: removed on every close, not only on the
        // Escape branch — otherwise every close through Done or the overlay would pile up an
        // orphaned keydown on document.
        let _dialogKeydown: ((e: KeyboardEvent) => void) | null = null;

        function removeDialogKeydown(): void {
            if (_dialogKeydown) {
                document.removeEventListener('keydown', _dialogKeydown);
                _dialogKeydown = null;
            }
        }

        ctx.track(() => () => removeDialogKeydown());

        function closeDialog(): void {
            removeDialogKeydown();
            _dialogOpen.set(false);
            _editingIndex.set(null);
        }

        function canAdd(): boolean {
            return _itemCount() < (ctx.maxItems() as number);
        }

        function canRemove(): boolean {
            return (ctx.removable() as boolean) && _itemCount() > (ctx.minItems() as number);
        }

        /**
         * Keep the ARRAY FIELD showing the rows this list holds.
         *
         * The rows are dotted fields — `lines.0.activity`, `lines.1.activity` — and `getValues()`
         * assembles them, which is why the payload is right. The leaf the array itself is,
         * `form.fields.lines`, is updated by nobody else, so without this anything that read it would
         * see an empty array with rows on screen: a count, a summary, or a step guard asking "are
         * these rows valid?" would have nothing to look at. `form.ts:646` describes the arrangement as this list
         * keeping its rows as dotted fields *and mirroring them onto the array field* — this is
         * the mirror.
         *
         * A leaf exists only when the array was seeded EMPTY: `flattenValues` keeps `[]` as a leaf
         * and expands a filled array into dotted paths. With no leaf there is nothing to mirror
         * onto, and the dotted fields are the state on their own.
         *
         * Reading the row fields here is what subscribes this effect to them, so typing in a row
         * updates the array field too. It writes only when the value actually changed: an
         * unconditional `onChange` would mark the form dirty on mount, and dirty is what the
         * "leave with unsaved work?" guards read.
         */
        ctx.track(() => {
            const count = _itemCount();
            const form = getForm();
            if (!form) return;
            const prefix = getArrayPath();
            const leaf = (form.fields as Record<string, { value(): unknown; onChange(v: unknown): void } | undefined>)[prefix];
            if (!leaf) return;
            const fields = ctx.itemFields() as FieldListItemSchema[];
            const rows: Record<string, unknown>[] = [];
            for (let i = 0; i < count; i++) {
                const row: Record<string, unknown> = {};
                for (const field of fields) {
                    const cell = (form.fields as Record<string, { value(): unknown } | undefined>)[`${prefix}.${i}.${field.name}`];
                    row[field.name] = cell ? cell.value() : undefined;
                }
                rows.push(row);
            }
            if (JSON.stringify(leaf.value() ?? []) === JSON.stringify(rows)) return;
            leaf.onChange(rows);
        });

        // Render the list imperatively (items are dynamic, can't use static template)
        ctx.track(() => {
            const count = _itemCount();
            const form = getForm();
            const fields = ctx.itemFields() as FieldListItemSchema[];
            const prefix = getArrayPath();
            const label = ctx.label() as string;
            // The `add` string, not a literal '+ Add' as the prop's default: a translated app would
            // otherwise show English under its list.
            const addLbl = (ctx.addLabel() as string) || getComponentString('field-list', 'add')();
            const showRemove = canRemove();
            const showAdd = canAdd();
            const displayMode = ctx.display() as string;
            // The dialog is part of what this track draws, so its state is read here, tracked: opening
            // a row and closing the dialog redraw the list.
            const dialogOpen = _dialogOpen();
            const editingIndex = _editingIndex();

            requestAnimationFrame(() => {
                const el = ctx.el;
                el.innerHTML = '';

                const wrapper = document.createElement('div');
                wrapper.className = 'pdx-field-list';

                // Header
                if (label || showAdd) {
                    const header = document.createElement('div');
                    header.className = 'pdx-field-list-header';
                    if (label) {
                        const lbl = document.createElement('span');
                        lbl.className = 'pdx-field-list-label';
                        lbl.textContent = label;
                        header.appendChild(lbl);
                    }
                    if (showAdd) {
                        const addBtn = document.createElement('button');
                        addBtn.type = 'button';
                        addBtn.className = 'pdx-outline';
                        addBtn.setAttribute('size', 'sm');
                        addBtn.textContent = addLbl;
                        addBtn.addEventListener('click', addItem);
                        header.appendChild(addBtn);
                    }
                    wrapper.appendChild(header);
                }

                // Column headers
                if (count > 0 && fields.length > 0) {
                    const headerRow = document.createElement('div');
                    headerRow.className = 'pdx-field-list-columns';
                    for (const field of fields) {
                        const col = document.createElement('span');
                        col.className = 'pdx-field-list-col-header';
                        col.textContent = field.label || field.name;
                        headerRow.appendChild(col);
                    }
                    if (showRemove || displayMode === 'dialog') {
                        // The same buttons the rows have, hidden and inert: the column is as wide as the
                        // cells under it in every theme, without measuring them.
                        const col = document.createElement('span');
                        col.className = 'pdx-field-list-col-header pdx-field-list-col-actions';
                        col.setAttribute('aria-hidden', 'true');
                        col.inert = true;
                        for (const b of actionButtons(-1, showRemove, displayMode)) {
                            b.removeAttribute('aria-label');
                            b.removeAttribute('title');
                            b.tabIndex = -1;
                            col.appendChild(b);
                        }
                        headerRow.appendChild(col);
                    }
                    wrapper.appendChild(headerRow);
                }

                // Rows
                const rows = document.createElement('div');
                rows.className = 'pdx-field-list-rows';

                for (let i = 0; i < count; i++) {
                    const row = document.createElement('div');
                    row.className = 'pdx-field-list-row';
                    row.dataset.index = String(i);

                    // Slot for custom row rendering (priority: slot > default)
                    const rowSlot = getRowSlot();
                    if (rowSlot && displayMode !== 'dialog') {
                        const itemValues: Record<string, unknown> = {};
                        for (const field of fields) {
                            const fieldPath = `${prefix}.${i}.${field.name}`;
                            const formField = form?.fields[fieldPath];
                            itemValues[field.name] = formField?.value() ?? null;
                        }
                        // `remove` for a row that draws its own button.
                        const idx = i;
                        const content = rowSlot({ item: itemValues, index: i, fields, remove: () => removeItem(idx) });
                        row.appendChild(content instanceof DocumentFragment ? content : content);
                        // The same remove button as any other row, built before the slot branch goes
                        // on to the next row: otherwise a custom row could not be removed.
                        if (showRemove) row.appendChild(actionsCell(i, showRemove, displayMode));
                        rows.appendChild(row);
                        continue;
                    }

                    if (displayMode === 'dialog') {
                        // Dialog mode: show read-only summary cells
                        for (const field of fields) {
                            const cell = document.createElement('div');
                            cell.className = 'pdx-field-list-cell';
                            const fieldPath = `${prefix}.${i}.${field.name}`;
                            const formField = form?.fields[fieldPath];
                            const val = formField?.value();
                            cell.textContent = val != null ? String(val) : '';
                            cell.style.cursor = 'pointer';
                            cell.title = getComponentString('field-list', 'cellHint')();
                            const idx = i;
                            cell.addEventListener('click', () => editItem(idx));
                            row.appendChild(cell);
                        }
                    } else {
                        // Inline mode: editable controls
                        for (const field of fields) {
                            const cell = document.createElement('div');
                            cell.className = 'pdx-field-list-cell';
                            const fieldPath = `${prefix}.${i}.${field.name}`;
                            const formField = form?.fields[fieldPath];

                            const tag = TYPE_TAG[field.type || 'text'] || 'pdx-input';
                            const input = document.createElement(tag);
                            if (field.placeholder) input.setAttribute('placeholder', field.placeholder);

                            if (formField) {
                                const val = formField.value();
                                if (CHECKED_TYPES.has(field.type || '')) {
                                    if (val) input.setAttribute('checked', '');
                                } else {
                                    input.setAttribute('value', String(val ?? ''));
                                }
                            }

                            const eventName = (tag === 'pdx-input' || tag === 'pdx-textarea') ? 'pdx-input' : 'pdx-change';
                            input.addEventListener(eventName, (e: Event) => {
                                const detail = (e as CustomEvent).detail;
                                const value = CHECKED_TYPES.has(field.type || '')
                                    ? detail?.checked
                                    : (detail?.value ?? (e.target as any)?.value);
                                formField?.onChange(value);
                            });
                            input.addEventListener('pdx-blur', () => formField?.onBlur());

                            cell.appendChild(input);
                            row.appendChild(cell);
                        }
                    }

                    // Action buttons: edit (dialog) or remove (inline)
                    if (showRemove || displayMode === 'dialog') {
                        row.appendChild(actionsCell(i, showRemove, displayMode));
                    }

                    rows.appendChild(row);
                }

                wrapper.appendChild(rows);

                // Empty state
                if (count === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'pdx-field-list-empty';
                    empty.textContent = getComponentString('field-list', 'empty')();
                    wrapper.appendChild(empty);
                }

                // Footer add button (when items exist)
                if (count > 0 && showAdd) {
                    const footer = document.createElement('div');
                    footer.className = 'pdx-field-list-footer';
                    const addBtn = document.createElement('button');
                    addBtn.type = 'button';
                    addBtn.className = 'pdx-outline';
                    addBtn.setAttribute('size', 'sm');
                    addBtn.textContent = addLbl;
                    addBtn.addEventListener('click', addItem);
                    footer.appendChild(addBtn);
                    wrapper.appendChild(footer);
                }

                // Dialog for editing items
                if (displayMode === 'dialog' && dialogOpen) {
                    const dialogEl = buildItemDialog(form, fields, prefix, editingIndex);
                    wrapper.appendChild(dialogEl);
                }

                el.appendChild(wrapper);
            });
        });

        /** A row's buttons: edit (dialog display) and remove (when allowed), for the row at `index`. */
        function actionButtons(index: number, showRemove: boolean, displayMode: string): HTMLButtonElement[] {
            const buttons: HTMLButtonElement[] = [];
            if (displayMode === 'dialog') {
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'pdx-ghost';
                editBtn.setAttribute('size', 'sm');
                editBtn.textContent = '✎';
                editBtn.title = getComponentString('field-list', 'edit')();
                // Icon-only: an explicit accessible name (axe button-name).
                editBtn.setAttribute('aria-label', getComponentString('field-list', 'edit')());
                editBtn.addEventListener('click', () => editItem(index));
                buttons.push(editBtn);
            }
            if (showRemove) {
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'pdx-ghost pdx-danger';
                removeBtn.setAttribute('size', 'sm');
                removeBtn.textContent = '×';
                removeBtn.title = getComponentString('field-list', 'remove')();
                removeBtn.setAttribute('aria-label', getComponentString('field-list', 'remove')());
                removeBtn.addEventListener('click', () => removeItem(index));
                buttons.push(removeBtn);
            }
            return buttons;
        }

        /** The actions cell of the row at `index`. */
        function actionsCell(index: number, showRemove: boolean, displayMode: string): HTMLElement {
            const cell = document.createElement('div');
            cell.className = 'pdx-field-list-cell pdx-field-list-cell-actions';
            for (const b of actionButtons(index, showRemove, displayMode)) cell.appendChild(b);
            return cell;
        }

        function buildItemDialog(
            form: Form<any> | null,
            fields: FieldListItemSchema[],
            prefix: string,
            editIdx: number | null,
        ): HTMLElement {
            const overlay = document.createElement('div');
            overlay.className = 'pdx-field-list-dialog-overlay';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeDialog();
            });

            const dialog = document.createElement('div');
            dialog.className = 'pdx-field-list-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-label', editIdx != null ? getComponentString('field-list', 'editItem')() : getComponentString('field-list', 'addItem')());

            // Title
            const title = document.createElement('div');
            title.className = 'pdx-field-list-dialog-title';
            title.textContent = editIdx != null
                ? getComponentString('field-list', 'editItemN')().replace('#{n}', `#${editIdx + 1}`)
                : getComponentString('field-list', 'addItem')();
            dialog.appendChild(title);

            // Fields
            const content = document.createElement('div');
            content.className = 'pdx-field-list-dialog-content';

            if (editIdx != null && form) {
                for (const field of fields) {
                    const fieldPath = `${prefix}.${editIdx}.${field.name}`;
                    const formField = form.fields[fieldPath];
                    if (!formField) continue;

                    const row = document.createElement('div');
                    row.className = 'pdx-field-list-dialog-field';

                    const label = document.createElement('label');
                    label.className = 'pdx-label';
                    label.textContent = field.label || field.name;
                    row.appendChild(label);

                    const tag = TYPE_TAG[field.type || 'text'] || 'pdx-input';
                    const input = document.createElement(tag);
                    if (field.placeholder) input.setAttribute('placeholder', field.placeholder);

                    const val = formField.value();
                    if (CHECKED_TYPES.has(field.type || '')) {
                        if (val) input.setAttribute('checked', '');
                    } else {
                        input.setAttribute('value', String(val ?? ''));
                    }

                    const eventName = (tag === 'pdx-input' || tag === 'pdx-textarea') ? 'pdx-input' : 'pdx-change';
                    input.addEventListener(eventName, (e: Event) => {
                        const detail = (e as CustomEvent).detail;
                        const value = CHECKED_TYPES.has(field.type || '')
                            ? detail?.checked
                            : (detail?.value ?? (e.target as any)?.value);
                        formField.onChange(value);
                    });
                    input.addEventListener('pdx-blur', () => formField.onBlur());

                    row.appendChild(input);
                    content.appendChild(row);
                }
            }
            dialog.appendChild(content);

            // Actions
            const actions = document.createElement('div');
            actions.className = 'pdx-field-list-dialog-actions';

            const doneBtn = document.createElement('button');
            doneBtn.type = 'button';
            doneBtn.className = 'pdx-primary';
            doneBtn.setAttribute('size', 'sm');
            doneBtn.textContent = getComponentString('field-list', 'done')();
            doneBtn.addEventListener('click', closeDialog);
            actions.appendChild(doneBtn);

            dialog.appendChild(actions);
            overlay.appendChild(dialog);

            // Escape to close (removed from closeDialog for EVERY close path)
            removeDialogKeydown();
            _dialogKeydown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') closeDialog();
            };
            document.addEventListener('keydown', _dialogKeydown);

            return overlay;
        }

        function getRowSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['row'] as SlotFunction | undefined;
        }

        return { addItem, removeItem, editItem, closeDialog, getRowSlot };
    },
    // Render is handled imperatively in setup via ctx.track()
    render: () => html``,
});
