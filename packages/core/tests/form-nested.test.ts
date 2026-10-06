// Tests for nested form paths — dotted-path field access, flatten/unflatten,
// and backward compatibility with flat forms.

import { describe, it, expect } from 'vitest';
import { flattenValues, unflattenValues, getNestedValue, setNestedValue, getFieldsByPrefix } from '../src/form/form-path';
import { createForm } from '../src/form/form';
import { FORM_INTERNALS } from '../src/form/form';
import type { FormInternals } from '../src/form/form';

// ─── prototype pollution guard ─────────────────────────────────────

describe('setNestedValue — prototype pollution guard', () => {
    it('does not pollute Object.prototype via __proto__ / constructor / prototype', () => {
        const o: Record<string, unknown> = {};
        setNestedValue(o, '__proto__.polluted', 'x');
        setNestedValue(o, 'constructor.prototype.polluted2', 'y');
        setNestedValue(o, 'a.__proto__.polluted3', 'z');
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(({} as Record<string, unknown>).polluted2).toBeUndefined();
        expect((Object.prototype as Record<string, unknown>).polluted3).toBeUndefined();
    });
    it('set/get normali continuano a funzionare', () => {
        const o: Record<string, unknown> = {};
        setNestedValue(o, 'a.b.c', 42);
        expect(getNestedValue(o, 'a.b.c')).toBe(42);
        expect(getNestedValue(o, '__proto__.x')).toBeUndefined();
    });
});

// ─── flattenValues ─────────────────────────────────────────────────

describe('flattenValues', () => {
    it('passes flat objects through unchanged', () => {
        const flat = flattenValues({ name: 'Jane', age: 30 });
        expect(flat).toEqual({ name: 'Jane', age: 30 });
    });

    it('flattens nested objects with dotted paths', () => {
        const flat = flattenValues({
            customer: { name: 'Jane', email: 'jane@test.com' },
        });
        expect(flat).toEqual({
            'customer.name': 'Jane',
            'customer.email': 'jane@test.com',
        });
    });

    it('flattens deeply nested objects', () => {
        const flat = flattenValues({
            billing: { address: { street: '123 Main', city: 'NYC' } },
        });
        expect(flat).toEqual({
            'billing.address.street': '123 Main',
            'billing.address.city': 'NYC',
        });
    });

    it('flattens arrays of objects per-item', () => {
        const flat = flattenValues({
            items: [
                { product: 'Widget', qty: 2 },
                { product: 'Gadget', qty: 1 },
            ],
        });
        expect(flat).toEqual({
            'items.0.product': 'Widget',
            'items.0.qty': 2,
            'items.1.product': 'Gadget',
            'items.1.qty': 1,
        });
    });

    it('does NOT flatten arrays of primitives', () => {
        const flat = flattenValues({ tags: ['a', 'b', 'c'] });
        expect(flat).toEqual({ tags: ['a', 'b', 'c'] });
    });

    it('handles empty arrays', () => {
        const flat = flattenValues({ items: [] });
        expect(flat).toEqual({ items: [] });
    });

    it('handles mixed flat + nested', () => {
        const flat = flattenValues({
            orderNumber: 'ORD-001',
            customer: { name: 'Jane' },
            notes: '',
        });
        expect(flat).toEqual({
            orderNumber: 'ORD-001',
            'customer.name': 'Jane',
            notes: '',
        });
    });

    it('handles null and undefined values', () => {
        const flat = flattenValues({ a: null, b: undefined, c: { d: null } });
        expect(flat).toEqual({ a: null, b: undefined, 'c.d': null });
    });

    it('does not flatten Date objects', () => {
        const d = new Date('2026-01-01');
        const flat = flattenValues({ created: d });
        expect(flat).toEqual({ created: d });
    });
});

// ─── unflattenValues ───────────────────────────────────────────────

describe('unflattenValues', () => {
    it('passes flat objects through unchanged', () => {
        const nested = unflattenValues({ name: 'Jane', age: 30 });
        expect(nested).toEqual({ name: 'Jane', age: 30 });
    });

    it('reconstructs nested objects from dotted paths', () => {
        const nested = unflattenValues({
            'customer.name': 'Jane',
            'customer.email': 'jane@test.com',
        });
        expect(nested).toEqual({
            customer: { name: 'Jane', email: 'jane@test.com' },
        });
    });

    it('reconstructs deeply nested objects', () => {
        const nested = unflattenValues({
            'billing.address.street': '123 Main',
            'billing.address.city': 'NYC',
        });
        expect(nested).toEqual({
            billing: { address: { street: '123 Main', city: 'NYC' } },
        });
    });

    it('reconstructs arrays from numeric segments', () => {
        const nested = unflattenValues({
            'items.0.product': 'Widget',
            'items.0.qty': 2,
            'items.1.product': 'Gadget',
            'items.1.qty': 1,
        });
        expect(nested).toEqual({
            items: [
                { product: 'Widget', qty: 2 },
                { product: 'Gadget', qty: 1 },
            ],
        });
    });

    it('handles mixed flat + nested', () => {
        const nested = unflattenValues({
            orderNumber: 'ORD-001',
            'customer.name': 'Jane',
        });
        expect(nested).toEqual({
            orderNumber: 'ORD-001',
            customer: { name: 'Jane' },
        });
    });
});

// ─── roundtrip ─────────────────────────────────────────────────────

describe('flatten/unflatten roundtrip', () => {
    it('roundtrips a complex nested object', () => {
        const original = {
            orderNumber: 'ORD-001',
            customer: { name: 'Jane', email: 'jane@test.com' },
            items: [
                { product: 'Widget', qty: 2, price: 9.99 },
                { product: 'Gadget', qty: 1, price: 19.99 },
            ],
            shipping: { street: '123 Main', city: 'NYC', zip: '10001' },
        };
        const flat = flattenValues(original);
        const restored = unflattenValues(flat);
        expect(restored).toEqual(original);
    });

    it('roundtrips flat objects unchanged', () => {
        const original = { name: 'Jane', email: 'jane@test.com', age: 30 };
        const flat = flattenValues(original);
        const restored = unflattenValues(flat);
        expect(restored).toEqual(original);
    });
});

// ─── getNestedValue / setNestedValue ───────────────────────────────

describe('getNestedValue', () => {
    it('gets top-level value', () => {
        expect(getNestedValue({ name: 'Jane' }, 'name')).toBe('Jane');
    });

    it('gets nested value', () => {
        expect(getNestedValue({ customer: { name: 'Jane' } }, 'customer.name')).toBe('Jane');
    });

    it('gets array item value', () => {
        expect(getNestedValue({ items: [{ qty: 2 }] }, 'items.0.qty')).toBe(2);
    });

    it('returns undefined for missing paths', () => {
        expect(getNestedValue({ a: 1 }, 'b.c')).toBeUndefined();
    });
});

describe('setNestedValue', () => {
    it('sets top-level value', () => {
        const obj: Record<string, unknown> = {};
        setNestedValue(obj, 'name', 'Jane');
        expect(obj).toEqual({ name: 'Jane' });
    });

    it('creates nested objects', () => {
        const obj: Record<string, unknown> = {};
        setNestedValue(obj, 'customer.name', 'Jane');
        expect(obj).toEqual({ customer: { name: 'Jane' } });
    });

    it('creates arrays for numeric segments', () => {
        const obj: Record<string, unknown> = {};
        setNestedValue(obj, 'items.0.qty', 2);
        expect(obj).toEqual({ items: [{ qty: 2 }] });
    });
});

// ─── getFieldsByPrefix ─────────────────────────────────────────────

describe('getFieldsByPrefix', () => {
    it('returns fields matching prefix', () => {
        const fields = {
            'items.0.product': 'Widget',
            'items.0.qty': 2,
            'items.1.product': 'Gadget',
            'customer.name': 'Jane',
        };
        expect(getFieldsByPrefix(fields, 'items.0')).toEqual(['items.0.product', 'items.0.qty']);
    });

    it('returns empty for no matches', () => {
        expect(getFieldsByPrefix({ 'a.b': 1 }, 'x')).toEqual([]);
    });
});

// ─── createForm with nested initialValues ──────────────────────────

describe('createForm — nested initialValues', () => {
    it('creates fields with dotted paths for nested objects', () => {
        const form = createForm({
            initialValues: {
                customer: { name: 'Jane', email: 'jane@test.com' },
            } as any,
        });
        expect(form.fields['customer.name']).toBeDefined();
        expect(form.fields['customer.email']).toBeDefined();
        expect(form.fields['customer.name'].value()).toBe('Jane');
        expect(form.fields['customer.email'].value()).toBe('jane@test.com');
    });

    it('creates fields for deeply nested objects', () => {
        const form = createForm({
            initialValues: {
                billing: { address: { city: 'NYC' } },
            } as any,
        });
        expect(form.fields['billing.address.city']).toBeDefined();
        expect(form.fields['billing.address.city'].value()).toBe('NYC');
    });

    it('creates fields for array items', () => {
        const form = createForm({
            initialValues: {
                items: [{ product: 'Widget', qty: 2 }],
            } as any,
        });
        expect(form.fields['items.0.product']).toBeDefined();
        expect(form.fields['items.0.product'].value()).toBe('Widget');
        expect(form.fields['items.0.qty'].value()).toBe(2);
    });

    it('getValues() reconstructs nested object', () => {
        const initial = {
            orderNumber: 'ORD-001',
            customer: { name: 'Jane', email: 'jane@test.com' },
            shipping: { city: 'NYC', zip: '10001' },
        };
        const form = createForm({ initialValues: initial as any });

        expect(form.getValues()).toEqual(initial);
    });

    it('getValues() reconstructs arrays', () => {
        const initial = {
            items: [
                { product: 'Widget', qty: 2 },
                { product: 'Gadget', qty: 1 },
            ],
        };
        const form = createForm({ initialValues: initial as any });
        expect(form.getValues()).toEqual(initial);
    });

    it('onChange updates nested field and tracks dirty', () => {
        const form = createForm({
            initialValues: { customer: { name: 'Jane' } } as any,
        });
        const field = form.fields['customer.name'];
        field.onChange('John');
        expect(field.value()).toBe('John');
        expect(field.dirty()).toBe(true);
    });

    it('reset() restores nested values', () => {
        const form = createForm({
            initialValues: { customer: { name: 'Jane' } } as any,
        });
        form.fields['customer.name'].onChange('John');
        expect(form.fields['customer.name'].value()).toBe('John');

        form.reset();
        expect(form.fields['customer.name'].value()).toBe('Jane');
        expect(form.fields['customer.name'].dirty()).toBe(false);
    });

    it('reset(newValues) updates with flattened new values', () => {
        const form = createForm({
            initialValues: { customer: { name: 'Jane' } } as any,
        });
        form.reset({ customer: { name: 'Alice' } } as any);
        expect(form.fields['customer.name'].value()).toBe('Alice');
    });

    it('setValues() applies nested partial update', () => {
        const form = createForm({
            initialValues: {
                customer: { name: 'Jane', email: 'jane@test.com' },
            } as any,
        });
        form.setValues({ customer: { name: 'John' } } as any);
        expect(form.fields['customer.name'].value()).toBe('John');
        // email unchanged because setValues only updates matching keys
    });

    it('validates fields with dotted-path validators', async () => {
        const form = createForm({
            initialValues: { customer: { name: '' } } as any,
            validators: {
                'customer.name': [(v: unknown) => (!v ? 'Required' : undefined)],
            } as any,
        });
        const valid = await form.validate();
        expect(valid).toBe(false);
        expect(form.fields['customer.name'].error()).toBe('Required');
    });

    it('form.valid is reactive to nested field errors', () => {
        const form = createForm({
            initialValues: { customer: { name: '' } } as any,
            validators: {
                'customer.name': [(v: unknown) => (!v ? 'Required' : undefined)],
            } as any,
            validateOn: 'onChange',
        });
        // Trigger validation via onChange
        form.fields['customer.name'].onChange('');
        expect(form.valid()).toBe(false);

        form.fields['customer.name'].onChange('Jane');
        expect(form.valid()).toBe(true);
    });
});

// ─── createForm — backward compatibility (flat) ────────────────────

describe('createForm — flat backward compat', () => {
    it('flat initialValues creates fields as before', () => {
        const form = createForm({
            initialValues: { name: '', email: '' },
        });
        expect(form.fields.name).toBeDefined();
        expect(form.fields.email).toBeDefined();
        expect(form.fields.name.value()).toBe('');
    });

    it('getValues() returns flat object', () => {
        const form = createForm({
            initialValues: { name: 'Jane', age: 30 },
        });
        expect(form.getValues()).toEqual({ name: 'Jane', age: 30 });
    });

    it('onChange/onBlur/reset work on flat fields', () => {
        const form = createForm<Record<string, unknown>>({
            initialValues: { name: '' },
        });
        form.fields.name.onChange('Jane');
        expect(form.fields.name.value()).toBe('Jane');
        expect(form.fields.name.dirty()).toBe(true);

        form.reset();
        expect(form.fields.name.value()).toBe('');
        expect(form.fields.name.dirty()).toBe(false);
    });

    it('validation works on flat fields', async () => {
        const form = createForm({
            initialValues: { name: '' },
            validators: { name: [(v: string) => (!v ? 'Required' : undefined)] },
        });
        const valid = await form.validate();
        expect(valid).toBe(false);
        expect(form.fields.name.error()).toBe('Required');
    });
});

// ─── FORM_INTERNALS (dynamic field management) ────────────────────

describe('FORM_INTERNALS', () => {
    it('addField creates a new field signal', () => {
        const form = createForm<Record<string, unknown>>({
            initialValues: { name: '' },
        });
        const internals = (form as any)[FORM_INTERNALS] as FormInternals;
        internals.addField('email', 'test@test.com');

        expect(form.fields['email']).toBeDefined();
        expect(form.fields['email'].value()).toBe('test@test.com');
    });

    it('addField is idempotent', () => {
        const form = createForm<Record<string, unknown>>({
            initialValues: { name: 'Jane' },
        });
        const internals = (form as any)[FORM_INTERNALS] as FormInternals;
        internals.addField('name', 'override');
        // Should NOT override existing field
        expect(form.fields.name.value()).toBe('Jane');
    });

    it('removeFields removes all fields with prefix', () => {
        const form = createForm({
            initialValues: {
                items: [{ product: 'Widget', qty: 2 }],
            } as any,
        });
        const internals = (form as any)[FORM_INTERNALS] as FormInternals;
        expect(form.fields['items.0.product']).toBeDefined();

        internals.removeFields('items.0');
        expect(form.fields['items.0.product']).toBeUndefined();
        expect(form.fields['items.0.qty']).toBeUndefined();
    });

    it('renameFields re-indexes fields', () => {
        const form = createForm({
            initialValues: {
                items: [
                    { product: 'A', qty: 1 },
                    { product: 'B', qty: 2 },
                ],
            } as any,
        });
        const internals = (form as any)[FORM_INTERNALS] as FormInternals;

        // Simulate removing item 0 and re-indexing item 1 → 0
        internals.removeFields('items.0');
        internals.renameFields('items.1', 'items.0');

        expect(form.fields['items.0.product']).toBeDefined();
        expect(form.fields['items.0.product'].value()).toBe('B');
        expect(form.fields['items.1.product']).toBeUndefined();
    });

    it('getFieldPaths returns all current paths', () => {
        const form = createForm({
            initialValues: {
                customer: { name: 'Jane' },
                notes: '',
            } as any,
        });
        const internals = (form as any)[FORM_INTERNALS] as FormInternals;
        const paths = internals.getFieldPaths();
        expect(paths).toContain('customer.name');
        expect(paths).toContain('notes');
    });

    it('valid/dirty recompute after addField', () => {
        const form = createForm<Record<string, unknown>>({
            initialValues: { name: 'Jane' },
        });
        expect(form.valid()).toBe(true);

        const internals = (form as any)[FORM_INTERNALS] as FormInternals;
        internals.addField('email', '');
        // New field with no validators → still valid
        expect(form.valid()).toBe(true);

        // Change new field to dirty
        form.fields['email'].onChange('changed');
        expect(form.dirty()).toBe(true);
    });
});

// ─── validateAll has to include addField's dynamic validators ───

describe('FORM_INTERNALS — dynamic validators in the submit', () => {
    it('a dynamic required field blocks validate(), touched or not', async () => {
        const form = createForm({ initialValues: { title: 'x' } });
        const internals = (form as unknown as Record<symbol, FormInternals>)[FORM_INTERNALS];
        internals.addField('items.0.name', '', [(v: unknown) => (v ? undefined : 'required')]);

        const ok = await form.validate();
        expect(ok).toBe(false);
        expect((form.errors() as Record<string, string>)['items.0.name']).toBe('required');
    });
});

// removeFields clears the pending timers of the removed field

describe('FORM_INTERNALS — the timers of removed fields', () => {
    it('a pending saveTimer does not save a removed field', async () => {
        const { vi } = await import('vitest');
        vi.useFakeTimers();
        const form = createForm<Record<string, unknown>>({
            initialValues: { title: 'x' },
            saveMode: 'onChange',
            saveDebounce: 200,
        });
        const saved: string[] = [];
        form.onFieldSave((name) => { saved.push(name); });

        const internals = (form as unknown as Record<symbol, FormInternals>)[FORM_INTERNALS];
        internals.addField('items.0.name', '');
        form.fields['items.0.name'].onChange('abc'); // arms the debounce
        internals.removeFields('items.0'); // removed before the flush

        await vi.advanceTimersByTimeAsync(500);
        expect(saved).not.toContain('items.0.name'); // without the fix: it saved the phantom field
        vi.useRealTimers();
    });
});
