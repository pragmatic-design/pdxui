// createFormFromSchema — a form built from JSON, which means from data the app did not write.
//
// That provenance is the reason this file has a ReDoS mitigation in it: a `pattern` rule arriving
// from a server-driven schema runs synchronously on every keystroke, and JavaScript has no regex
// timeout. An untested mitigation is the worst state for a defence to be in.

import { describe, it, expect, vi } from 'vitest';
import { createFormFromSchema, evaluateVisibility } from '../src/form/form-schema';
import type { FormSchema } from '../src/form/form-schema';

const schema = (fields: FormSchema['fields']): FormSchema => ({ fields });

describe('createFormFromSchema — initial values', () => {
    it('gives each type the empty value that type means', () => {
        const form = createFormFromSchema(schema([
            { name: 'text', type: 'text' },
            { name: 'agree', type: 'checkbox' },
            { name: 'on', type: 'switch' },
            { name: 'qty', type: 'number' },
            { name: 'level', type: 'slider' },
            { name: 'stars', type: 'rating' },
            { name: 'labels', type: 'tags' },
        ]));

        const v = form.getValues();
        expect(v.text).toBe('');
        expect(v.agree, 'an unticked box is false, not an empty string').toBe(false);
        expect(v.on).toBe(false);
        expect(v.qty).toBe(0);
        expect(v.level).toBe(0);
        expect(v.stars).toBe(0);
        expect(v.labels).toEqual([]);
    });

    it('prefers the declared default', () => {
        const form = createFormFromSchema(schema([
            { name: 'qty', type: 'number', default: 5 },
            { name: 'name', type: 'text', default: 'Ada' },
        ]));
        expect(form.getValues().qty).toBe(5);
        expect(form.getValues().name).toBe('Ada');
    });

    it('flattens a group into dotted paths', () => {
        const form = createFormFromSchema(schema([
            { name: 'address', type: 'group', fields: [
                { name: 'city', type: 'text', default: 'Roma' },
                { name: 'zip', type: 'text' },
            ] },
        ]));
        // The form addresses the field as `address.city`, but getValues() hands back the shape
        // the server wants — nested, not a literal dotted key.
        expect(Object.keys(form.fields)).toEqual(['address.city', 'address.zip']);
        const address = form.getValues().address as Record<string, unknown>;
        expect(address.city).toBe('Roma');
        expect(address.zip).toBe('');
    });

    it('nests a group inside a group', () => {
        const form = createFormFromSchema(schema([
            { name: 'a', type: 'group', fields: [
                { name: 'b', type: 'group', fields: [{ name: 'c', type: 'text', default: 'x' }] },
            ] },
        ]));
        const a = form.getValues().a as Record<string, Record<string, unknown>>;
        expect(a.b.c).toBe('x');
    });
});

describe('createFormFromSchema — list fields', () => {
    it('builds a real nested array, not indexed keys', () => {
        // A flat `items.0.product` shape is invisible to getNestedValue, so form.array(path) would
        // find nothing and every default would be lost.
        const form = createFormFromSchema(schema([
            { name: 'items', type: 'list', itemFields: [
                { name: 'product', type: 'text' },
                { name: 'qty', type: 'number' },
            ], default: [{ product: 'Pen', qty: 2 }] },
        ]));

        const items = form.getValues().items as Record<string, unknown>[];
        expect(Array.isArray(items)).toBe(true);
        expect(items[0]).toEqual({ product: 'Pen', qty: 2 });
    });

    it('fills a missing key in a default row from itemDefault, then from the type', () => {
        const form = createFormFromSchema(schema([
            { name: 'items', type: 'list',
                itemFields: [{ name: 'a', type: 'text' }, { name: 'b', type: 'number' }],
                itemDefault: { a: 'from-itemDefault' },
                default: [{ b: 7 }] },
        ]));
        const items = form.getValues().items as Record<string, unknown>[];
        expect(items[0].a).toBe('from-itemDefault');
        expect(items[0].b).toBe(7);
    });

    it('pre-populates up to minItems', () => {
        const form = createFormFromSchema(schema([
            { name: 'items', type: 'list', minItems: 2,
                itemFields: [{ name: 'a', type: 'text' }] },
        ]));
        const items = form.getValues().items as unknown[];
        expect(items, 'a list with a minimum must open with that many rows').toHaveLength(2);
    });

    it('leaves a list with no default and no minimum empty', () => {
        const form = createFormFromSchema(schema([
            { name: 'items', type: 'list', itemFields: [{ name: 'a', type: 'text' }] },
        ]));
        expect(form.getValues().items).toEqual([]);
    });
});

describe('createFormFromSchema — validators from the schema', () => {
    it('turns required into a rule', async () => {
        const form = createFormFromSchema(schema([{ name: 'name', type: 'text', required: true }]));
        await form.validate();
        expect(form.errors().name).toBeTruthy();
    });

    it('builds each declared rule type', async () => {
        const form = createFormFromSchema(schema([
            { name: 'mail', type: 'text', validators: [{ type: 'email' }] },
            { name: 'site', type: 'text', validators: [{ type: 'url' }] },
            { name: 'n', type: 'number', validators: [{ type: 'integer' }] },
            { name: 'short', type: 'text', validators: [{ type: 'minLength', params: { min: 3 } }] },
            { name: 'long', type: 'text', validators: [{ type: 'maxLength', params: { max: 2 } }] },
            { name: 'small', type: 'number', validators: [{ type: 'min', params: { min: 10 } }] },
            { name: 'big', type: 'number', validators: [{ type: 'max', params: { max: 1 } }] },
        ]));

        form.setValues({ mail: 'nope' });
        form.setValues({ site: 'nope' });
        form.setValues({ n: 1.5 });
        form.setValues({ short: 'a' });
        form.setValues({ long: 'abc' });
        form.setValues({ small: 1 });
        form.setValues({ big: 99 });
        await form.validate();

        for (const field of ['mail', 'site', 'n', 'short', 'long', 'small', 'big']) {
            expect(form.errors()[field], field).toBeTruthy();
        }
    });

    it('carries a custom message through', async () => {
        const form = createFormFromSchema(schema([
            { name: 'mail', type: 'text', validators: [{ type: 'email', message: 'Serve una email' }] },
        ]));
        form.setValues({ mail: 'x' });
        await form.validate();
        expect(form.errors().mail).toBe('Serve una email');
    });

    it('accepts a custom function, and ignores a custom rule with no function', async () => {
        const form = createFormFromSchema(schema([
            { name: 'a', type: 'text', validators: [{ type: 'custom', validate: () => 'always wrong' }] },
            { name: 'b', type: 'text', validators: [{ type: 'custom' }] },
        ]));
        await form.validate();
        expect(form.errors().a).toBe('always wrong');
        expect(form.errors().b).toBeUndefined();
    });

    it('ignores a rule type it does not know rather than throwing', () => {
        expect(() => createFormFromSchema(schema([
            { name: 'a', type: 'text', validators: [{ type: 'telepathy' } as never] },
        ]))).not.toThrow();
    });

    it('keeps warnings separate from errors', async () => {
        const form = createFormFromSchema(schema([
            { name: 'pw', type: 'text', warnings: [{ type: 'minLength', params: { min: 8 }, message: 'Weak' }] },
        ]));
        form.setValues({ pw: 'abc' });
        await form.validate();
        expect(form.errors().pw, 'a warning must not block submission').toBeUndefined();
        expect(form.warnings().pw).toBe('Weak');
    });
});

describe('createFormFromSchema — patterns from an untrusted schema', () => {
    it('validates against a normal pattern', async () => {
        const form = createFormFromSchema(schema([
            { name: 'zip', type: 'text', validators: [
                { type: 'pattern', params: { pattern: '^\\d{5}$' }, message: 'Five digits' },
            ] },
        ]));

        form.setValues({ zip: '1234' });
        await form.validate();
        expect(form.errors().zip).toBe('Five digits');

        form.setValues({ zip: '12345' });
        await form.validate();
        expect(form.errors().zip).toBeUndefined();
    });

    it('skips a pattern the engine cannot compile, and says so', async () => {
        // An invalid regex in a server-driven schema must not make the field unfillable.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const form = createFormFromSchema(schema([
            { name: 'x', type: 'text', validators: [{ type: 'pattern', params: { pattern: '([' } }] },
        ]));
        form.setValues({ x: 'anything' });
        await form.validate();

        expect(form.errors().x, 'a broken rule blocked the input').toBeUndefined();
        expect(warn.mock.calls.some(c => String(c[0]).includes('invalid pattern'))).toBe(true);
        warn.mockRestore();
    });

    it('warns about nested quantifiers and caps the input it tests', async () => {
        // (a+)+$ against a long non-matching string is the textbook catastrophic backtrack. The
        // mitigation is to stop testing past a cap — so a very long value is ACCEPTED rather than
        // pinning the main thread on every keystroke.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const form = createFormFromSchema(schema([
            { name: 'x', type: 'text', validators: [{ type: 'pattern', params: { pattern: '^(a+)+$' } }] },
        ]));

        expect(warn.mock.calls.some(c => String(c[0]).includes('ReDoS')),
            'a risky pattern was accepted without a word').toBe(true);
        warn.mockRestore();

        form.setValues({ x: 'b'.repeat(500) });      // past the 100-char risky cap
        const started = Date.now();
        await form.validate();

        expect(form.errors().x, 'the capped input should not be tested at all').toBeUndefined();
        expect(Date.now() - started, 'the regex ran anyway').toBeLessThan(1000); // PERF-EXEMPT: ReDoS guard — the failure mode is seconds of backtracking, and the assertion above it (no error recorded) is the real check
    });

    it('still tests a short value against the risky pattern', () => {
        // The control: the cap must not turn the rule off entirely.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const form = createFormFromSchema(schema([
            { name: 'x', type: 'text', validators: [{ type: 'pattern', params: { pattern: '^(a+)+$' } }] },
        ]));
        warn.mockRestore();
        form.setValues({ x: 'bbb' });
        return form.validate().then(() => {
            expect(form.errors().x).toBeTruthy();
        });
    });
});

describe('evaluateVisibility', () => {
    const v = { role: 'admin', age: 30, note: '', missing: null as unknown };

    it('defaults to equality', () => {
        expect(evaluateVisibility({ field: 'role', value: 'admin' }, v)).toBe(true);
        expect(evaluateVisibility({ field: 'role', value: 'user' }, v)).toBe(false);
    });

    it('handles the comparisons', () => {
        expect(evaluateVisibility({ field: 'role', op: 'neq', value: 'user' }, v)).toBe(true);
        expect(evaluateVisibility({ field: 'age', op: 'gt', value: 18 }, v)).toBe(true);
        expect(evaluateVisibility({ field: 'age', op: 'lt', value: 18 }, v)).toBe(false);
        expect(evaluateVisibility({ field: 'age', op: 'gte', value: 30 }, v)).toBe(true);
        expect(evaluateVisibility({ field: 'age', op: 'lte', value: 30 }, v)).toBe(true);
    });

    it('handles contains, on the string form of the value', () => {
        expect(evaluateVisibility({ field: 'role', op: 'contains', value: 'dmi' }, v)).toBe(true);
        expect(evaluateVisibility({ field: 'age', op: 'contains', value: '3' }, v)).toBe(true);
    });

    it('empty and notEmpty treat an empty string, null and undefined alike', () => {
        expect(evaluateVisibility({ field: 'note', op: 'empty' }, v)).toBe(true);
        expect(evaluateVisibility({ field: 'missing', op: 'empty' }, v)).toBe(true);
        expect(evaluateVisibility({ field: 'nothing', op: 'empty' }, v)).toBe(true);
        expect(evaluateVisibility({ field: 'role', op: 'empty' }, v)).toBe(false);
        expect(evaluateVisibility({ field: 'role', op: 'notEmpty' }, v)).toBe(true);
        expect(evaluateVisibility({ field: 'note', op: 'notEmpty' }, v)).toBe(false);
    });

    it('shows the field when the operator is not understood', () => {
        // Fail visible, not hidden: a schema with a typo in it should not silently remove a field
        // the user has to fill in.
        expect(evaluateVisibility({ field: 'role', op: 'wat' as never, value: 'x' }, v)).toBe(true);
    });
});
