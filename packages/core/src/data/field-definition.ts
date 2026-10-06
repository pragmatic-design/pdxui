// Unified field definition — ONE JSON drives grid, form, and filter builder.
// FieldDefinition[] can be converted to ColumnDef[], FormFieldSchema[], or FilterField[].

import type { ColumnDef, ColumnType } from './data-grid-types';
import { humanizeField } from './data-grid-types';
import type { FormFieldSchema, FormFieldType, ValidatorSchema } from '../form/form-schema';
import type { FilterOperator } from './transport';

// ─── Unified Field Definition ──────────────────────────────

export type FieldType = ColumnType; // text|number|date|boolean|enum|currency|email|custom

// Defined in data-grid-types (more primitive) to avoid cycles; re-exported here.
export type { FilterOptionItem, FilterOptionsLoader } from './data-grid-types';
import type { FilterOptionsLoader } from './data-grid-types';

export interface FieldDefinition {
    /** Field path (supports dotted: 'address.city'). */
    field: string;
    /** Display label. Default: humanized from field name. */
    label?: string;
    /** Data type — drives editor, filter operators, formatting. */
    type?: FieldType;

    // ─── Form ───
    /** Required field. */
    required?: boolean;
    /** Validation rules. */
    validators?: ValidatorSchema[];
    /** Override editor component type. */
    editorType?: FormFieldType;
    /** Extra props for the editor component. */
    editorProps?: Record<string, unknown>;

    // ─── Grid ───
    /** Column width in px. */
    width?: number;
    /** Minimum column width. */
    minWidth?: number;
    /** Allow sorting. Default: true. */
    sortable?: boolean;
    /** Allow filtering. Default: true. */
    filterable?: boolean;
    /** Allow editing. Default: false. */
    editable?: boolean;
    /** Freeze column. */
    frozen?: 'left' | 'right';
    /** Hidden by default (available in column chooser). */
    hidden?: boolean;

    // ─── Filter ───
    /** Limit available filter operators. */
    filterOperators?: FilterOperator[];
    /** Enum values for select/filter. */
    options?: { label: string; value: unknown }[];
    /** Enum/lookup filter: allow selecting multiple values (operator `in`/`notin`). */
    multiple?: boolean;
    /** Enum/lookup filter: enable type-to-search in the value editor. */
    searchable?: boolean;
    /** Enum/lookup filter: load options on demand (server-side). Phase-2 editors
     *  use this for autocomplete; when present it supersedes the static `options`. */
    optionsSource?: FilterOptionsLoader;
    /** Set/Excel filter: checklist of distinct values derived from the data. */
    filterSet?: boolean;

    // ─── Display ───
    /** Cell alignment. */
    align?: 'left' | 'center' | 'right';
    /** Format pattern (string only — no functions in JSON). */
    format?: string;
}

// ─── Filter Field (for pdx-filter-builder) ─────────────────

export interface FilterField {
    field: string;
    label: string;
    type: FieldType;
    operators: FilterOperator[];
    options?: { label: string; value: unknown }[];
    multiple?: boolean;
    searchable?: boolean;
    optionsSource?: FilterOptionsLoader;
}

// ─── Operator defaults per type ────────────────────────────

const TEXT_OPS: FilterOperator[] = ['contains', 'eq', 'neq', 'startswith', 'endswith', 'isnull', 'isnotnull'];
const NUMBER_OPS: FilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'isnull', 'isnotnull'];
/** Relative date presets — a range relative to "now", carrying no value of its own. */
export const RELATIVE_DATE_OPS: FilterOperator[] = ['today', 'yesterday', 'thisweek', 'thismonth', 'thisyear', 'last7days', 'last30days'];
const DATE_OPS: FilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', ...RELATIVE_DATE_OPS, 'isnull', 'isnotnull'];
// Enum/lookup are set-membership, not text — picking values out of a set.
const ENUM_OPS: FilterOperator[] = ['in', 'notin', 'isnull', 'isnotnull'];

/**
 * The filter operators that make sense for a field type — what a filter builder should offer.
 *
 * The distinctions are deliberate: text gets `contains`/`startswith`, numbers and dates get the
 * comparisons plus `between`, dates ALSO get the relative presets (`today`, `last7days`) which carry
 * no value because they are a range against now, and enums get set membership (`in`/`notin`) rather
 * than text matching — an enum is chosen from a list, not typed.
 *
 * An unknown type falls back to the text set, which is the widest and least wrong.
 */
export function opsForType(type: FieldType | undefined): FilterOperator[] {
    switch (type) {
        case 'number': case 'currency': return NUMBER_OPS;
        case 'date': return DATE_OPS;
        case 'boolean': return ['eq'];
        case 'enum': return ENUM_OPS;
        default: return TEXT_OPS;
    }
}

// ─── Column type → Form field type ─────────────────────────

function fieldTypeToFormType(type: FieldType | undefined): FormFieldType {
    switch (type) {
        case 'number': case 'currency': return 'number';
        case 'date': return 'date';
        case 'boolean': return 'checkbox';
        case 'enum': return 'select';
        case 'email': return 'email';
        default: return 'text';
    }
}

// ─── Converters ────────────────────────────────────────────

/** Convert FieldDefinition[] → ColumnDef[] for pdx-data-grid. */
export function toColumnDefs(fields: FieldDefinition[]): ColumnDef[] {
    return fields.map(f => {
        const col: ColumnDef = {
            field: f.field,
            header: f.label ?? humanizeField(f.field),
            type: f.type,
            width: f.width,
            minWidth: f.minWidth,
            sortable: f.sortable,
            filterable: f.filterable,
            editable: f.editable,
            frozen: f.frozen,
            hidden: f.hidden,
            align: f.align,
            filterOperators: f.filterOperators,
            filterOptions: f.options,
            filterMultiple: f.multiple,
            filterSearchable: f.searchable,
            filterOptionsSource: f.optionsSource,
            filterSet: f.filterSet,
            validators: f.validators,
            editorType: f.editorType,
            editorProps: f.editorProps,
        };
        if (f.format) col.format = f.format;
        return col;
    });
}

/** Convert FieldDefinition[] → FormFieldSchema[] for pdx-auto-form / pdx-form-template. */
export function toFormFields(fields: FieldDefinition[]): FormFieldSchema[] {
    return fields
        .filter(f => f.editable !== false && f.type !== 'custom')
        .map(f => {
            const schema: FormFieldSchema = {
                name: f.field,
                label: f.label ?? humanizeField(f.field),
                type: f.editorType ?? fieldTypeToFormType(f.type),
                required: f.required,
                validators: f.validators,
                props: f.editorProps,
            };
            if (f.options) schema.options = f.options;
            if (f.optionsSource) schema.optionsSource = f.optionsSource; // server-side autocomplete (unified field def)
            return schema;
        });
}

/** Convert FieldDefinition[] → FilterField[] for pdx-filter-builder. */
export function toFilterFields(fields: FieldDefinition[]): FilterField[] {
    return fields
        .filter(f => f.filterable !== false && f.type !== 'custom')
        .map(f => ({
            field: f.field,
            label: f.label ?? humanizeField(f.field),
            type: (f.type ?? 'text') as FieldType,
            operators: f.filterOperators ?? opsForType(f.type),
            options: f.options,
            multiple: f.multiple,
            searchable: f.searchable,
            optionsSource: f.optionsSource,
        }));
}
