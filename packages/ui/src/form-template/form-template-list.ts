// pdx-form-template's list field: its rows of the item's fields, with add and remove, and the validators
// and defaults a new row's fields are made with (#1210).

import { effect, FORM_INTERNALS, required, email, minLength, maxLength, min, max, integer, url, pattern, getFieldTypeTag, getComponentString, formField } from '@pdxui/core';
import type { Form, FormFieldSchema, FormInternals, Validator, ValidatorSchema } from '@pdxui/core';
import { format } from '../shared/i18n';
import { onControlValue } from '../shared/model-event';
import { TYPE_TAG } from './form-template-controls';

// ─── Array List Renderer ────────────────────────────────────

/** A list field: its rows, each a line of the item's fields, with add and remove. */
export function createListElement(
    field: FormFieldSchema,
    form: Form<Record<string, unknown>>,
    totalColumns: number,
    fieldPath: string,
): HTMLElement {
    const internals = (form as any)[FORM_INTERNALS] as FormInternals | undefined;
    const itemFields = field.itemFields!;
    const itemDefault = field.itemDefault ?? {};
    const minItems = field.minItems ?? 0;
    const maxItems = field.maxItems ?? 999;

    const wrapper = document.createElement('div');
    wrapper.className = 'pdx-field-list';
    wrapper.style.gridColumn = `span ${field.size ?? totalColumns}`;

    // Count existing items
    function getItemCount(): number {
        if (!internals) return 0;
        const paths = internals.getFieldPaths();
        const prefix = fieldPath + '.';
        let maxIdx = -1;
        for (const p of paths) {
            if (p.startsWith(prefix)) {
                const idx = parseInt(p.slice(prefix.length).split('.')[0], 10);
                if (!isNaN(idx) && idx > maxIdx) maxIdx = idx;
            }
        }
        return maxIdx + 1;
    }

    // Grid template: 1fr per field + 40px for actions button
    const gridCols = itemFields.map(() => '1fr').join(' ') + ' 40px';

    function renderList(): void {
        wrapper.innerHTML = '';
        const count = getItemCount();

        // Header: label + add button, same row
        const header = document.createElement('div');
        header.className = 'pdx-field-list-header';
        header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--pdx-space-sm);';
        // Skip label when inside a section (section legend already shows the title)
        if (field.label && !field.section) {
            const lbl = document.createElement('span');
            lbl.className = 'pdx-field-list-label';
            lbl.style.cssText = 'font-weight: var(--pdx-weight-semibold); font-size: var(--pdx-text-sm);';
            lbl.textContent = field.label;
            header.appendChild(lbl);
        }
        if (count < maxItems) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'pdx-outline';
            addBtn.setAttribute('size', 'sm');
            addBtn.textContent = getComponentString('form-template', 'list.add')();
            addBtn.addEventListener('click', () => {
                if (!internals) return;
                const idx = getItemCount();
                for (const f of itemFields) {
                    const validators = buildFieldValidators(f);
                    internals.addField(`${fieldPath}.${idx}.${f.name}`, (itemDefault as any)[f.name] ?? getFieldDefault(f.type), validators);
                }
                renderList();
            });
            header.appendChild(addBtn);
        }
        wrapper.appendChild(header);

        // Column headers — grid row matching data rows
        if (count > 0) {
            const colHeader = document.createElement('div');
            colHeader.className = 'pdx-field-list-columns';
            colHeader.style.cssText = `display: grid; grid-template-columns: ${gridCols}; gap: var(--pdx-space-sm); padding: var(--pdx-space-xs) 0; border-bottom: 2px solid var(--pdx-color-border); margin-bottom: var(--pdx-space-xs);`;
            for (const f of itemFields) {
                const col = document.createElement('span');
                col.style.cssText = 'font-size: var(--pdx-text-xs); font-weight: var(--pdx-weight-semibold); color: var(--pdx-color-muted); text-transform: uppercase; letter-spacing: 0.04em;';
                col.textContent = f.label || f.name;
                colHeader.appendChild(col);
            }
            // Actions column header (empty)
            const actCol = document.createElement('span');
            colHeader.appendChild(actCol);
            wrapper.appendChild(colHeader);
        }

        // Rows — each row is a grid matching column headers
        for (let i = 0; i < count; i++) {
            const row = document.createElement('div');
            row.className = 'pdx-field-list-row';
            row.style.cssText = `display: grid; grid-template-columns: ${gridCols}; gap: var(--pdx-space-sm); align-items: center; padding: var(--pdx-space-xs) 0; border-bottom: 1px solid var(--pdx-color-border);`;

            for (const f of itemFields) {
                const cell = document.createElement('div');
                cell.className = 'pdx-field-list-cell';
                const itemPath = `${fieldPath}.${i}.${f.name}`;

                // Wrap input in pdx-form-field for error display
                const fieldWrapper = document.createElement('pdx-form-field');
                fieldWrapper.setAttribute('name', itemPath);
                // No label in table rows — column header already shows it. That names the cell by
                // sight only: the control is named "{column}, line {n}".
                fieldWrapper.setAttribute('label', '');
                fieldWrapper.setAttribute('a11y-label', format(getComponentString('form-template', 'list.cell')(),
                    { label: f.label || f.name, n: i + 1 }));

                const tag = TYPE_TAG[f.type || 'text'] || getFieldTypeTag(f.type || 'text') || 'pdx-input';
                const input = document.createElement(tag);
                input.setAttribute('name', itemPath);
                if (f.placeholder) input.setAttribute('placeholder', f.placeholder);
                // email/url/tel/etc. map to pdx-input → carry the native input type (same as the
                // top-level path) so list items keep semantics/keyboard/validation, not generic text.
                if (tag === 'pdx-input' && f.type && f.type !== 'text') input.setAttribute('type', f.type);

                const boundField = formField(form, itemPath);
                if (boundField) {
                    const val = boundField.value();
                    if (val !== undefined && val !== null && val !== '') {
                        (input as any).value = val;
                    }
                    // Its model's event, or the alpha one of a control that has no model yet (#125).
                    const isText = tag === 'pdx-input' || tag === 'pdx-textarea';
                    const evt = isText ? 'pdx-input' : 'pdx-change';
                    onControlValue(input, evt, (e) => e.detail?.value ?? (e.target as any)?.value, (value) => boundField.onChange(value));
                    input.addEventListener('pdx-blur', () => boundField.onBlur());

                    // Manual error wiring for list items (same reason as regular fields)
                    effect(() => {
                        const err = boundField.error();
                        if (err) {
                            fieldWrapper.setAttribute('error', err);
                            fieldWrapper.setAttribute('show-error', '');
                        } else {
                            fieldWrapper.removeAttribute('error');
                            fieldWrapper.removeAttribute('show-error');
                        }
                    });
                    effect(() => {
                        if (boundField.touched()) fieldWrapper.setAttribute('touched', '');
                        else fieldWrapper.removeAttribute('touched');
                    });
                }

                fieldWrapper.appendChild(input);
                cell.appendChild(fieldWrapper);
                row.appendChild(cell);
            }

            // Remove button
            if (count > minItems) {
                const actCell = document.createElement('div');
                actCell.className = 'pdx-field-list-cell pdx-field-list-cell-actions';
                const rmBtn = document.createElement('button');
                rmBtn.type = 'button';
                rmBtn.className = 'pdx-ghost pdx-danger';
                rmBtn.setAttribute('size', 'sm');
                rmBtn.textContent = '×';
                rmBtn.title = getComponentString('form-template', 'list.remove')();
                rmBtn.setAttribute('aria-label', format(getComponentString('form-template', 'list.removeLine')(), { n: i + 1 }));
                const idx = i;
                rmBtn.addEventListener('click', () => {
                    if (!internals) return;
                    const hadFocus = wrapper.contains(document.activeElement);
                    internals.removeFields(`${fieldPath}.${idx}`);
                    for (let j = idx + 1; j < count; j++) {
                        internals.renameFields(`${fieldPath}.${j}`, `${fieldPath}.${j - 1}`);
                    }
                    renderList();
                    // The list is rebuilt, so the focused button is gone and focus would fall to <body>: it
                    // goes to the first field of the row now in that place, else of the row before,
                    // else to "+ Add".
                    if (hadFocus) focusAfterRemoval(idx);
                });
                actCell.appendChild(rmBtn);
                row.appendChild(actCell);
            }

            wrapper.appendChild(row);
        }

        // Empty state
        if (count === 0) {
            const empty = document.createElement('div');
            empty.className = 'pdx-field-list-empty';
            empty.textContent = getComponentString('form-template', 'list.empty')();
            wrapper.appendChild(empty);
        }
    }

    /** After row `idx` went: the first field of the row now there, of the previous row, or "+ Add". */
    function focusAfterRemoval(idx: number): void {
        const rows = wrapper.querySelectorAll<HTMLElement>('.pdx-field-list-row');
        const row = rows[Math.min(idx, rows.length - 1)];
        const first = row?.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]:not([tabindex="-1"])');
        (first ?? wrapper.querySelector<HTMLElement>('.pdx-field-list-header button'))?.focus();
    }

    renderList();

    // Re-render when field structure changes externally (e.g., form.reset())
    if (internals?.fieldVersion) {
        effect(() => {
            internals.fieldVersion(); // subscribe to changes
            renderList();
        });
    }

    return wrapper;
}

function getFieldDefault(type: string): unknown {
    switch (type) {
        case 'checkbox': case 'switch': return false;
        case 'number': case 'slider': case 'rating': return 0;
        default: return '';
    }
}

/** Build validator array from a field schema definition. */
function buildFieldValidators(field: FormFieldSchema): Validator<unknown>[] {
    const result: Validator<unknown>[] = [];
    if (field.required) result.push(required() as Validator<unknown>);
    if (field.validators) {
        for (const v of field.validators) {
            const built = buildSchemaValidator(v);
            if (built) result.push(built);
        }
    }
    return result;
}

function buildSchemaValidator(schema: ValidatorSchema): Validator<unknown> | null {
    const msg = schema.message;
    const p = schema.params ?? {};
    switch (schema.type) {
        case 'required': return required(msg) as Validator<unknown>;
        case 'email': return email(msg) as Validator<unknown>;
        case 'url': return url(msg) as Validator<unknown>;
        case 'integer': return integer(msg) as Validator<unknown>;
        case 'minLength': return minLength(p.min as number ?? 1, msg) as Validator<unknown>;
        case 'maxLength': return maxLength(p.max as number ?? 100, msg) as Validator<unknown>;
        case 'min': return min(p.min as number ?? 0, msg) as Validator<unknown>;
        case 'max': return max(p.max as number ?? 100, msg) as Validator<unknown>;
        case 'pattern': return pattern(new RegExp(p.pattern as string ?? ''), msg) as Validator<unknown>;
        default: return null;
    }
}
