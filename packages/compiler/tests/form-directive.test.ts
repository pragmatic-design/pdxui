// Tests for @form directive — parsing inline and external schemas.

import { describe, it, expect } from 'vitest';
import { analyzeScript } from '../src/compiler/script-analyzer';

describe('@form parsing — inline schema', () => {
    it('detects @form with simple fields', () => {
        const a = analyzeScript(`
            @form contact: {
                name: string { required, minLength: 3 },
                email: string { required, email },
            }
        `, 'contact.pdx');

        expect(a.forms).toHaveLength(1);
        expect(a.forms[0].name).toBe('contact');
        expect(a.forms[0].kind).toBe('inline');
        expect(a.forms[0].fields).toHaveLength(2);

        const nameField = a.forms[0].fields![0];
        expect(nameField.name).toBe('name');
        expect(nameField.type).toBe('string');
        expect(nameField.required).toBe(true);
        expect(nameField.rules).toContain('minLength: 3');

        const emailField = a.forms[0].fields![1];
        expect(emailField.name).toBe('email');
        expect(emailField.required).toBe(true);
        expect(emailField.rules).toContain('email');
    });

    it('detects optional fields', () => {
        const a = analyzeScript(`
            @form user: {
                name: string { required },
                age?: number { min: 0 },
            }
        `, 'user.pdx');

        expect(a.forms[0].fields![0].required).toBe(true);
        expect(a.forms[0].fields![1].required).toBe(false);
        expect(a.forms[0].fields![1].type).toBe('number');
    });

    it('detects field array', () => {
        const a = analyzeScript(`
            @form order: {
                customer: string { required },
                items: [{
                    product: string { required },
                    quantity: number { min: 1 },
                }]
            }
        `, 'order.pdx');

        const itemsField = a.forms[0].fields!.find(f => f.name === 'items');
        expect(itemsField).toBeDefined();
        expect(itemsField!.isArray).toBe(true);
        expect(itemsField!.arrayFields).toHaveLength(2);
        expect(itemsField!.arrayFields![0].name).toBe('product');
        expect(itemsField!.arrayFields![1].name).toBe('quantity');
    });

    it('detects fields without validation rules', () => {
        const a = analyzeScript(`
            @form simple: {
                note: string,
            }
        `, 'simple.pdx');

        expect(a.forms[0].fields![0].name).toBe('note');
        expect(a.forms[0].fields![0].required).toBe(false);
        expect(a.forms[0].fields![0].rules).toEqual([]);
    });
});

describe('@form parsing — external schema', () => {
    it('detects @form with external schema reference', () => {
        const a = analyzeScript(`
            import { UserSchema } from './schemas';
            @form user: UserSchema;
        `, 'user.pdx');

        expect(a.forms).toHaveLength(1);
        expect(a.forms[0].name).toBe('user');
        expect(a.forms[0].kind).toBe('external');
        expect(a.forms[0].schemaExpr).toBe('UserSchema');
    });
});

describe('@form — mode and exports', () => {
    it('@form activates new mode', () => {
        const a = analyzeScript(`
            @form user: {
                name: string { required },
            }
        `, 'user.pdx');
        expect(a.mode).toBe('new');
    });

    it('@form name is auto-exported', () => {
        const a = analyzeScript(`
            @form contact: {
                name: string,
            }
        `, 'contact.pdx');
        expect(a.exports).toContainEqual({ name: 'contact', kind: 'const' });
    });

    it('adds createForm to usedFeatures', () => {
        const a = analyzeScript(`
            @form user: {
                name: string,
            }
        `, 'user.pdx');
        expect(a.usedFeatures.has('createForm')).toBe(true);
    });

    it('coexists with @prop and signals', () => {
        const a = analyzeScript(`
            @prop title: string = 'Form';
            @form user: {
                name: string { required },
            }
            let count = $signal(0);
        `, 'combined.pdx');

        expect(a.props).toHaveLength(1);
        expect(a.forms).toHaveLength(1);
        expect(a.signals).toHaveLength(1);
    });
});

// ─── Rules inside an array field ──────────────────────────────────
//
// A rule inside an array field's object does not drop the WHOLE `@form` declaration: the
// declaration compiles and the array field is emitted as `lines: []`. The first two tests below pin
// that.
//
// What IS lost is narrower and real: the analyzer parses the rules into `arrayFields` and NOBODY
// reads them. `required` on a row field of an inline schema is discarded between the parser and the
// generated `createForm`, because the form's validators are keyed by field name and a row's path
// (`lines.0.product`) does not exist until the row does. Silently, which is the part that is not
// acceptable — so the compiler says so, and points at the mechanism that does enforce it.
describe('@form — a rule inside an array field', () => {
    const analyse = (decl: string) =>
        analyzeScript(`${decl}\nfunction save() {}`, 'order.pdx', { setup: true });

    it('does not drop the declaration', () => {
        const a = analyse('@form order: { lines: [{ product: string { required }, qty: number }] }');
        expect(a.forms, 'the @form declaration was dropped').toHaveLength(1);
        const fields = a.forms[0].fields ?? [];
        expect(fields.map(f => f.name)).toEqual(['lines']);
        expect(fields[0].isArray).toBe(true);
    });

    it('parses the row schema, rules included', () => {
        const a = analyse('@form order: { lines: [{ product: string { required }, qty: number }] }');
        const sub = a.forms[0].fields?.[0]?.arrayFields ?? [];
        expect(sub.map(f => f.name)).toEqual(['product', 'qty']);
        expect(sub[0].required, 'the rule inside the array was not parsed at all').toBe(true);
    });

    it('says the rules will not be applied, instead of discarding them in silence', () => {
        const found = analyse('@form order: { lines: [{ product: string { required }, qty: number }] }')
            .warnings.filter(w => w.code === 'PDX_FORM_ARRAY_RULES_IGNORED');

        expect(found).toHaveLength(1);
        expect(found[0].message, 'the message must name the array field').toContain('lines');
        expect(found[0].message, 'and the field whose rule is lost').toContain('product');
        expect(found[0].hint, 'and point at the mechanism that does enforce it')
            .toContain('pdx-field-list');
    });

    it('names every field of the row that carries a rule, not only the first', () => {
        const found = analyse('@form order: { lines: [{ product: string { required }, qty: number { min: 1 } }] }')
            .warnings.filter(w => w.code === 'PDX_FORM_ARRAY_RULES_IGNORED');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('product');
        expect(found[0].message).toContain('qty');
    });

    it('is silent when the row carries no rules', () => {
        const a = analyse('@form order: { lines: [{ product: string, qty: number }] }');
        expect(a.warnings.filter(w => w.code === 'PDX_FORM_ARRAY_RULES_IGNORED')).toEqual([]);
    });

    it('is silent about a rule on a scalar field, which IS applied', () => {
        const a = analyse('@form order: { customer: string { required }, lines: [{ product: string }] }');
        expect(a.warnings.filter(w => w.code === 'PDX_FORM_ARRAY_RULES_IGNORED')).toEqual([]);
    });
});
