// Each field is a member of its form (#128, step 1): `f.email`, not `f.fields.email`.
//
// The form's own members keep their meaning: a field named like one of them would hide it, so it is
// refused (`PDX_FORM_FIELD_RESERVED`, decision 13). A name known only at run time is read with
// `formField`, which cannot return a member. `pnpm typecheck` compiles this file: the type cases are
// part of the test.

import { describe, it, expect, expectTypeOf } from 'vitest';
import { createForm, formField, formFieldNames, required, FORM_INTERNALS } from '../src/index';
import type { Form, FormField, FormInternals } from '../src/index';

type Order = { email: string; customer: { name: string }; lines: { qty: number }[] };
const initialValues: Order = { email: '', customer: { name: 'Ada' }, lines: [{ qty: 2 }] };

describe('a field is a member of its form', () => {
    it('reaches a field, a nested one and a row one as members', async () => {
        const f = createForm({ initialValues, validators: { email: [required()] } });
        expect(f.email.value()).toBe('');
        expect(f['customer.name'].value()).toBe('Ada');
        expect(f['lines.0.qty'].value()).toBe(2);
        f.email.onChange('');
        expect(await f.validate()).toBe(false);
        expect(f.email.error()).toEqual(expect.any(String));
        expect(f.email.required).toBe(true);
    });

    it('has no fields member any more', () => {
        const f = createForm({ initialValues });
        expect('fields' in f).toBe(false);
        expectTypeOf<Form<Order>>().not.toHaveProperty('fields');
    });

    it('types each member by the value it holds', () => {
        expectTypeOf<Form<Order>['email']>().toEqualTypeOf<FormField<string>>();
        expectTypeOf<Form<Order>['customer.name']>().toEqualTypeOf<FormField<string>>();
        expectTypeOf<Form<Order>>().not.toHaveProperty('customer');
        // @ts-expect-error — not a field of the form
        void ((f: Form<Order>) => f.emial);
    });

    it('keeps the keys of an interface that extends a record, and types none for a bare record', () => {
        interface Job extends Record<string, unknown> { customer: string }
        expectTypeOf<Form<Job>['customer']>().toEqualTypeOf<FormField<string>>();
        // @ts-expect-error — a record names no field the type could know
        void ((f: Form<Record<string, unknown>>) => f.anything);
    });

    it('keeps a typed form assignable to a form typed by a record', () => {
        const f = createForm({ initialValues });
        const loose: Form<Record<string, unknown>> = f;
        expect(loose.valid()).toBe(true);
    });

    it('follows the fields a field list adds, renames and removes', () => {
        const f = createForm({ initialValues });
        const internals = (f as unknown as { [FORM_INTERNALS]: FormInternals })[FORM_INTERNALS];
        const members = f as unknown as Record<string, FormField<unknown> | undefined>;
        internals.addField('rows.0.sku', 'A');
        expect(members['rows.0.sku']?.value()).toBe('A');
        internals.renameFields('rows.0', 'rows.1');
        expect(members['rows.0.sku']).toBeUndefined();
        expect(members['rows.1.sku']?.value()).toBe('A');
        internals.removeFields('rows.1');
        expect(members['rows.1.sku']).toBeUndefined();
    });
});

describe('a field named like a member of the form', () => {
    it.each(['valid', 'errors', 'reset', 'dirty', 'getValues', 'handleSubmit', 'array'])(
        "'%s' is refused, naming the member",
        (name) => {
            expect(() => createForm({ initialValues: { [name]: '' } })).toThrow(
                new RegExp(`PDX_FORM_FIELD_RESERVED.*'${name}'`),
            );
        },
    );

    it('is refused when a field list adds it too', () => {
        const f = createForm({ initialValues: { email: '' } });
        const internals = (f as unknown as { [FORM_INTERNALS]: FormInternals })[FORM_INTERNALS];
        expect(() => internals.addField('reset', '')).toThrow(/PDX_FORM_FIELD_RESERVED/);
        expect(typeof f.reset).toBe('function');
    });

    it('may still be the leaf of a nested field', () => {
        const f = createForm({ initialValues: { address: { state: 'RM' } } });
        expect(f['address.state'].value()).toBe('RM');
    });
});

describe('formField: a name known only at run time', () => {
    it('returns the field, and undefined for a member or an unknown name', () => {
        const f = createForm({ initialValues });
        expect(formField(f, 'customer.name')?.value()).toBe('Ada');
        expect(formField(f, 'reset')).toBeUndefined();
        expect(formField(f, 'nope')).toBeUndefined();
    });

    it('lists the fields, and only them', () => {
        const f = createForm({ initialValues });
        // `lines` has a row, so its fields are the row's: the array is a field only while it is empty.
        expect(formFieldNames(f).sort()).toEqual(['customer.name', 'email', 'lines.0.qty']);
    });
});
