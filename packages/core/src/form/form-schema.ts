// FormSchema — JSON-driven form definition.
// Defines field types, layout, sections, conditional visibility, validators.
// Used by <pdx-form-template> to generate forms from data.

import { DEV } from '../utils/env';
import { createForm } from './form';
import { setNestedValue } from './form-path';
import { required, minLength, maxLength, email, pattern, url, min, max, integer } from './validators';
import type { Form, FormConfig, SaveMode } from './form';
import type { Validator } from './validators';

// ─── Schema Types ─────────────────────────────────────────────

export type FormFieldType =
    | 'text' | 'email' | 'password' | 'url' | 'tel'
    | 'number' | 'textarea' | 'select' | 'checkbox'
    | 'switch' | 'radio' | 'slider' | 'rating'
    | 'date' | 'time' | 'datetime'
    | 'color' | 'file' | 'tags' | 'segmented'
    | 'lookup'
    | 'group' | 'list'
    | 'custom';

/** Async option loader for select/lookup fields (server-side autocomplete). */
export type FieldOptionsLoader = (query: string) => Promise<{ label: string; value: unknown }[]>;

export interface FormFieldSchema {
    /** Field name (matches form field key). */
    name: string;
    /** Input type — maps to a pdx-* component. */
    type: FormFieldType;
    /** Display label. */
    label?: string;
    /** Placeholder text. */
    placeholder?: string;
    /** Whether the field is required. */
    required?: boolean;
    /** Whether the field is disabled. */
    disabled?: boolean;
    /** Whether the field is read-only. */
    readonly?: boolean;
    /** Grid column span (1-12). Default: 12 (full width). */
    size?: number;
    /** Section name this field belongs to. */
    section?: string;
    /** Validation rules (built-in types). */
    validators?: ValidatorSchema[];
    /** Options for select, radio, segmented. */
    options?: unknown[];
    /** Multi-value select/lookup (many-to-many): renders chips, value is an array. */
    multiple?: boolean;
    /** Server-side options for select/lookup: load on demand as the user types. */
    optionsSource?: FieldOptionsLoader;
    /** DataSource for select/lookup remote binding (alternative to optionsSource). */
    source?: unknown;
    /** Option object key for the display label (select/lookup with object options). */
    labelField?: string;
    /** Option object key for the value (select/lookup with object options). */
    valueField?: string;
    /** Default value. */
    default?: unknown;
    /** Hint text shown below the field. */
    hint?: string;
    /** Description text shown above the input (wired to aria-describedby). */
    description?: string;
    /** Conditional visibility — show only when condition is met. */
    visibleWhen?: VisibilityCondition;
    /** Async validator (e.g., server-side uniqueness check). */
    asyncValidator?: (value: unknown) => Promise<string | undefined>;
    /** Warning validators (non-blocking yellow hints). */
    warnings?: ValidatorSchema[];
    /** Per-field save mode override. */
    saveMode?: SaveMode;
    /** Extra props passed to the component (type-specific). */
    props?: Record<string, unknown>;
    /** Nested fields for type='group' — renders as <pdx-field-group>. */
    fields?: FormFieldSchema[];
    /** Item field definitions for type='list' — renders as <pdx-field-list>. */
    itemFields?: FormFieldSchema[];
    /** Default values for new items in type='list'. */
    itemDefault?: Record<string, unknown>;
    /** Min items for type='list'. */
    minItems?: number;
    /** Max items for type='list'. */
    maxItems?: number;
}

export interface VisibilityCondition {
    /** Field name to watch. */
    field: string;
    /** Comparison operator. Default: 'eq'. */
    op?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'empty' | 'notEmpty';
    /** Value to compare against (for eq/neq/gt/lt/contains). */
    value?: unknown;
}

export interface FormSectionSchema {
    /** Section identifier. */
    name: string;
    /** Display label. */
    label: string;
    /** Whether the section can be collapsed. */
    collapsible?: boolean;
    /** Whether the section starts collapsed. */
    collapsed?: boolean;
    /** Override layout mode for this section (overrides form-level layout). */
    layout?: 'stack' | 'grid' | 'horizontal';
    /** Override grid columns for this section. */
    columns?: number;
}

export interface ValidatorSchema {
    /** Built-in validator type, or 'custom' for a user-provided function. */
    type: 'required' | 'email' | 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern' | 'integer' | 'url' | 'custom';
    /** Custom error message. */
    message?: string;
    /** Parameters (e.g., { min: 3 } for minLength). */
    params?: Record<string, unknown>;
    /** Custom validator function (for type: 'custom'). */
    validate?: (value: unknown) => string | undefined;
    /** Async custom validator (for type: 'custom'). */
    asyncValidate?: (value: unknown) => Promise<string | undefined>;
}

export interface AsyncValidatorSchema {
    /** Async validator function. */
    validate: (value: unknown) => Promise<string | undefined>;
}

export interface FormSchema {
    /** Field definitions. */
    fields: FormFieldSchema[];
    /** Section definitions (optional). */
    sections?: FormSectionSchema[];
    /** Layout mode. Default: 'stack'. 'wizard' turns sections into steps. */
    layout?: 'stack' | 'grid' | 'horizontal' | 'wizard';
    /** Grid columns count. Default: 12. */
    columns?: number;
    /** Form-level save mode. */
    saveMode?: SaveMode;
    /**
     * The rules that read more than one field — an end before its start — as `createForm` takes
     * them: `{ field: message }`, shown on that field. Without it, a form built from a schema could
     * not compare two of its fields.
     */
    validate?: FormConfig<Record<string, unknown>>['validate'];
}

// ─── Schema → Form Factory ───────────────────────────────────

/**
 * Create a Form instance from a FormSchema.
 * Automatically generates initialValues, validators, and fieldConfig.
 */
export function createFormFromSchema(schema: FormSchema): Form<Record<string, unknown>> {
    const initialValues: Record<string, unknown> = {};
    const validators: Record<string, Validator<unknown>[]> = {};
    const asyncValidators: Record<string, (value: unknown) => Promise<string | undefined>> = {};
    const warnings: Record<string, Validator<unknown>[]> = {};
    const fieldConfig: Record<string, { saveMode?: SaveMode }> = {};

    // Recursively collect fields, building nested initialValues
    function processFields(fields: FormFieldSchema[], prefix: string): void {
        for (const field of fields) {
            const path = prefix ? `${prefix}.${field.name}` : field.name;

            if (field.type === 'group' && field.fields) {
                // Nested object — recurse into child fields
                processFields(field.fields, path);
                continue;
            }

            if (field.type === 'list' && field.itemFields) {
                // Array of objects — build a NESTED array so form.array(path) can read it
                // via getNestedValue(initialValues, path). A flat indexed shape
                // (`items.0.product`) is invisible to getNestedValue → defaults lost.
                const itemFields: FormFieldSchema[] = field.itemFields;
                const defaults = Array.isArray(field.default) ? (field.default as unknown[]) : [];

                const buildItem = (src?: Record<string, unknown>): Record<string, unknown> => {
                    const obj: Record<string, unknown> = {};
                    for (const f of itemFields) {
                        obj[f.name] = src?.[f.name] ?? field.itemDefault?.[f.name] ?? getTypeDefault(f.type);
                    }
                    return obj;
                };

                const items: Record<string, unknown>[] = defaults.map(
                    (d) => buildItem(d as Record<string, unknown>),
                );

                // Apply minItems — pre-populate empty items up to the minimum.
                const minItems = field.minItems ?? 0;
                while (items.length < minItems) items.push(buildItem());

                setNestedValue(initialValues, path, items);
                continue;
            }

            // Regular field
            initialValues[path] = field.default ?? getTypeDefault(field.type);

            // Build validators
            const fieldValidators: Validator<unknown>[] = [];
            if (field.required) {
                fieldValidators.push(required() as Validator<unknown>);
            }
            if (field.validators) {
                for (const v of field.validators) {
                    const validator = buildValidator(v);
                    if (validator) fieldValidators.push(validator);
                }
            }
            if (fieldValidators.length > 0) {
                validators[path] = fieldValidators;
            }

            // Async validator
            if (field.asyncValidator) {
                asyncValidators[path] = field.asyncValidator as (value: unknown) => Promise<string | undefined>;
            }

            // Warning validators
            if (field.warnings) {
                const fieldWarnings: Validator<unknown>[] = [];
                for (const w of field.warnings) {
                    const validator = buildValidator(w);
                    if (validator) fieldWarnings.push(validator);
                }
                if (fieldWarnings.length > 0) warnings[path] = fieldWarnings;
            }

            // Per-field save mode
            if (field.saveMode) {
                fieldConfig[path] = { saveMode: field.saveMode };
            }
        }
    }

    processFields(schema.fields, '');

    return createForm({
        initialValues,
        validators,
        asyncValidators: Object.keys(asyncValidators).length > 0 ? asyncValidators : undefined,
        warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
        fieldConfig,
        saveMode: schema.saveMode,
        validate: schema.validate,
    } as FormConfig<Record<string, unknown>>);
}

// ─── Visibility Evaluation ────────────────────────────────────

/**
 * Evaluate a visibility condition against current form values.
 */
export function evaluateVisibility(
    condition: VisibilityCondition,
    values: Record<string, unknown>,
): boolean {
    const fieldValue = values[condition.field];
    const op = condition.op ?? 'eq';

    switch (op) {
        case 'eq': return fieldValue === condition.value;
        case 'neq': return fieldValue !== condition.value;
        case 'gt': return (fieldValue as number) > (condition.value as number);
        case 'lt': return (fieldValue as number) < (condition.value as number);
        case 'gte': return (fieldValue as number) >= (condition.value as number);
        case 'lte': return (fieldValue as number) <= (condition.value as number);
        case 'contains': return String(fieldValue).includes(String(condition.value));
        case 'empty': return fieldValue === null || fieldValue === undefined || fieldValue === '';
        case 'notEmpty': return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
        default: return true;
    }
}

// ─── Helpers ──────────────────────────────────────────────────

function getTypeDefault(type: FormFieldType): unknown {
    switch (type) {
        case 'checkbox':
        case 'switch': return false;
        case 'number':
        case 'slider':
        case 'rating': return 0;
        case 'tags': return [];
        default: return '';
    }
}

// ─── ReDoS mitigation for schema-driven patterns ─────────────────
//
// A `pattern` validator can come from an UNTRUSTED, server-driven schema and
// runs synchronously on every keystroke. JS has no regex-execution timeout, so
// a catastrophic-backtracking pattern (e.g. `(a+)+$`) on a long input can pin
// the main thread (ReDoS). Mitigation (JS-pragmatic):
//   (a) compile the RegExp ONCE here (already done — buildValidator runs at form
//       creation, not per validation);
//   (b) CAP the tested input length so the backtracking blow-up is bounded;
//   (c) heuristically detect nested quantifiers ((x+)+, (x*)*, (x+)*) — when the
//       source looks risky, warn once and apply a tighter input cap.

/** Max input length tested against a pattern by default. */
const PATTERN_MAX_INPUT = 2000;
/** Tighter cap when the pattern source looks vulnerable to backtracking. */
const PATTERN_RISKY_MAX_INPUT = 100;

/** Detect nested-quantifier shapes that enable catastrophic backtracking. */
function isRiskyPattern(source: string): boolean {
    // Group whose body ends in a quantifier, followed by another quantifier:
    // (…+)+  (…*)*  (…+)*  (…*)+  etc. Conservative heuristic, false positives ok.
    return /\([^)]*[+*][^)]*\)[+*]/.test(source);
}

/**
 * Build a ReDoS-resistant pattern validator.
 * Compiles the RegExp once (cached in closure) and caps the input length tested.
 */
function safePattern(source: string, msg?: string): Validator<unknown> {
    let regex: RegExp;
    try {
        regex = new RegExp(source);
    } catch {
        // Invalid pattern in an untrusted schema → never block input on a broken regex.
        if (DEV) {
            console.warn(`[pdx] form schema: invalid pattern "${source}" — skipped.`);
        }
        return () => undefined;
    }
    const risky = isRiskyPattern(source);
    if (DEV && risky) {
        console.warn(
            `[pdx] form schema: pattern "${source}" has nested quantifiers (ReDoS risk). ` +
            `Input length capped to ${PATTERN_RISKY_MAX_INPUT} for this rule.`,
        );
    }
    const cap = risky ? PATTERN_RISKY_MAX_INPUT : PATTERN_MAX_INPUT;
    const inner = pattern(regex, msg) as Validator<unknown>;
    return (value: unknown) => {
        // Skip the regex test entirely for over-long input to bound backtracking.
        if (typeof value === 'string' && value.length > cap) return undefined;
        return inner(value);
    };
}

function buildValidator(schema: ValidatorSchema): Validator<unknown> | null {
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
        case 'pattern': return safePattern((p.pattern as string) ?? '', msg);
        case 'custom':
            if (schema.validate) return schema.validate as Validator<unknown>;
            return null;
        default: return null;
    }
}
