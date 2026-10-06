// Bridge: ColumnDef → FormFieldSchema for DataGrid edit mode.
// Converts grid column definitions to form field schemas,
// enabling automatic form generation for row/dialog editing.

import type { ColumnType, ResolvedColumn } from './data-grid-types';
import type { FormFieldType, FormFieldSchema, FormSchema } from '../form/form-schema';
import { createFormFromSchema } from '../form/form-schema';
import type { Form } from '../form/form';

/** Map column type to form field type. */
export function columnTypeToFormType(colType: ColumnType | undefined): FormFieldType {
    switch (colType) {
        case 'number':
        case 'currency': return 'number';
        case 'date':     return 'date';
        case 'boolean':  return 'checkbox';
        case 'enum':     return 'select';
        case 'email':    return 'email';
        default:         return 'text';
    }
}

/** Convert editable columns to form field schemas. */
export function columnsToFormFields(columns: ResolvedColumn[]): FormFieldSchema[] {
    return columns
        .filter(col => {
            if (col.def.command || col.def.compute) return false;
            if (col.def.editable === false) return false;
            return true;
        })
        .map(col => {
            const fieldType = col.def.editorType ?? columnTypeToFormType(col.type);
            const schema: FormFieldSchema = {
                name: col.field,
                label: col.header,
                type: fieldType,
                validators: col.def.validators,
                required: col.def.validators?.some(v => v.type === 'required'),
            };

            // Reuse filterOptions as select options
            if (col.def.filterOptions && (fieldType === 'select' || col.type === 'enum')) {
                schema.options = col.def.filterOptions;
            }

            // Pass through extra editor props
            if (col.def.editorProps) {
                schema.props = col.def.editorProps;
            }

            return schema;
        });
}

/** Create a Form instance from grid columns + row data for editing. */
export function createEditForm(
    columns: ResolvedColumn[],
    row: Record<string, unknown>,
): Form<Record<string, unknown>> {
    const fields = columnsToFormFields(columns);
    const schema: FormSchema = { fields, layout: 'grid', columns: 12 };

    // Set initial values from row data
    const form = createFormFromSchema(schema);
    const values: Record<string, unknown> = {};
    for (const f of fields) {
        values[f.name] = row[f.name];
    }
    form.reset(values);
    return form;
}
