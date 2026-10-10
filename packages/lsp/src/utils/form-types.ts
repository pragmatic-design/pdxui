// The TypeScript type of an `@form` name, written out from its declaration.
//
// `@form profile: { name: string, address: { street: string }, lines: [{ qty: number }] }` compiles
// to `createForm({ initialValues: … })`, and `createForm` flattens what it is given: the fields are
// `name`, `address.street`, `lines` and, per row, `lines.0.qty`, while `getValues()` gives the
// nested object back. So the type has two halves — the values V, nested, and the fields F, keyed as
// the form keys them — and both are read from the compiler's own parse of the declaration.

import { inlineFormFields, type FormFieldDecl } from '@pdxui/compiler';

/** A field's declared type as TypeScript. */
function tsType(declared: string): string {
    if (declared.endsWith('[]')) return `${tsType(declared.slice(0, -2))}[]`;
    if (declared === 'string' || declared === 'number' || declared === 'boolean') return declared;
    // A union of literals, `'low' | 'high'`, is already TypeScript.
    if (/['"]/.test(declared)) return declared;
    // Any other word starts as `''`, as the compiler gives it, and is whatever a control writes.
    return 'unknown';
}

/** `{ a: string; b: number }` for a list of fields — the shape of one object of values. */
function valuesOf(fields: FormFieldDecl[]): string {
    const entries = fields.map((f) => {
        if (f.isArray) return `${JSON.stringify(f.name)}: ${valuesOf(f.arrayFields ?? [])}[]`;
        if (f.objectFields) return `${JSON.stringify(f.name)}: ${valuesOf(f.objectFields)}`;
        return `${JSON.stringify(f.name)}: ${tsType(f.type)}`;
    });
    return `{ ${entries.join('; ')} }`;
}

/** The fields as createForm keys them: dotted for an object, per row for an array of objects. */
function fieldsOf(fields: FormFieldDecl[]): string {
    const entries: string[] = [];
    for (const f of fields) {
        if (f.isArray) {
            // The array itself is a field (it starts empty), and each row's fields appear as rows do.
            entries.push(`${JSON.stringify(f.name)}: PdxFormField<${valuesOf(f.arrayFields ?? [])}[]>`);
            for (const sub of f.arrayFields ?? []) {
                entries.push(`[k: \`${f.name}.\${number}.${sub.name}\`]: PdxFormField<${tsType(sub.type)}>`);
            }
        } else if (f.objectFields) {
            for (const sub of f.objectFields) {
                entries.push(`${JSON.stringify(`${f.name}.${sub.name}`)}: PdxFormField<${tsType(sub.type)}>`);
            }
        } else {
            entries.push(`${JSON.stringify(f.name)}: PdxFormField<${tsType(f.type)}>`);
        }
    }
    return `{ ${entries.join('; ')} }`;
}

/**
 * The type to declare an `@form` name with, from its whole declaration — `@form name: …;`.
 *
 * An inline schema gives its fields. An external one (`@form user: UserSchema`) names a VALUE — a
 * Zod or Valibot schema — whose fields the projection does not know: a form all the same, with
 * fields of unknown name and value. Null for a declaration neither reading understands.
 */
export function formTypeOf(declaration: string): string | null {
    // Match: @form name: SchemaName   (external: a name, where an inline schema opens a brace)
    if (/^@form\s+\w+\s*:\s*\w/.test(declaration)) return `${CORE_FORM}<Record<string, unknown>>`;
    const fields = inlineFormFields(declaration);
    if (fields.length === 0) return null;
    // A flat form is exactly core's Form<V>: its fields ARE its value keys. Core's own type, so it is
    // assignable wherever a page hands the form to a helper typed `Form<Values>` — four showcase
    // pages do, and a look-alike interface is not: TypeScript cannot relate the conditional return
    // of `array()` across two value types.
    if (fields.every((f) => !f.isArray && !f.objectFields)) return `${CORE_FORM}<${valuesOf(fields)}>`;
    // Nested objects and rows are keyed apart from the values (`address.street`, `lines.0.qty`),
    // which core's Form does not describe: the projection writes both halves out.
    return `PdxForm<${valuesOf(fields)}, ${fieldsOf(fields)}>`;
}

/** Core's Form, resolved from the .pdx's own place — every PDX application depends on core. */
const CORE_FORM = 'import("@pdxui/core").Form';
