// A form's fields, errors and warnings are keyed by the names `createForm` gives them (#470).
//
// `createForm` flattens `{ customer: { name } }` into the field `customer.name`, and each row of an
// array of objects into `lines.0.qty`; the array itself is a field too. `Form` typed `fields`,
// `errors` and `warnings` by the top-level keys, so `form.fields['customer.name']` did not compile
// and `form.fields.customer`, which never exists, did. `pnpm typecheck` compiles this file: the
// cases below are the type test, and the run checks the runtime is the one described.

import { describe, it, expect, expectTypeOf } from 'vitest';
import { createForm, required } from '../src/index';
import type { Form, FormField } from '../src/index';

interface Address { city: string; zip: string }
type Order = { reference: string; customer: { name: string; address: Address }; lines: { qty: number; sku: string }[]; tags: string[] };

const initialValues: Order = {
    reference: 'R-1',
    customer: { name: 'Ada', address: { city: 'Roma', zip: '00100' } },
    lines: [{ qty: 2, sku: 'A' }],
    tags: ['x'],
};

describe('fields keyed by the flattened name', () => {
    it('reach a nested field, a row field and an array, with no cast', async () => {
        const form = createForm({ initialValues, validators: { 'customer.name': [required()] } });
        expect(form.fields['customer.name'].value()).toBe('Ada');
        expect(form.fields['customer.address.city'].value()).toBe('Roma');
        expect(form.fields['lines.0.qty'].value()).toBe(2);
        expect(form.fields.tags.value()).toEqual(['x']);
        form.fields['customer.name'].onChange('');
        expect(await form.validate()).toBe(false);
        expect(form.errors()['customer.name']).toEqual(expect.any(String));
        expect(form.warnings()['customer.name']).toBeUndefined();
    });

    it('type each field by the value it holds, and know no other', () => {
        type F = Form<Order>['fields'];
        expectTypeOf<F['customer.name']>().toEqualTypeOf<FormField<string>>();
        // An interface is entered like an object type: its keys are fields too.
        expectTypeOf<F['customer.address.zip']>().toEqualTypeOf<FormField<string>>();
        expectTypeOf<F[`lines.${number}.qty`]>().toEqualTypeOf<FormField<number>>();
        expectTypeOf<F['lines']>().toEqualTypeOf<FormField<{ qty: number; sku: string }[]>>();
        expectTypeOf<F['tags']>().toEqualTypeOf<FormField<string[]>>();
        // An object is no field: its keys are.
        expectTypeOf<F>().not.toHaveProperty('customer');
        expectTypeOf<F>().not.toHaveProperty('customer.address');
        // @ts-expect-error — not a field of the form
        void ((f: F) => f['customer.nmae']);
    });

    it('key errors and warnings by the same names', () => {
        type E = ReturnType<Form<Order>['errors']>;
        type W = ReturnType<Form<Order>['warnings']>;
        expectTypeOf<E['customer.address.city']>().toEqualTypeOf<string | undefined>();
        expectTypeOf<W[`lines.${number}.sku`]>().toEqualTypeOf<string | undefined>();
        expectTypeOf<E>().not.toHaveProperty('customer');
    });

    it('take a nested subset in setValues and reset, as the runtime merges it', () => {
        const form = createForm({ initialValues });
        form.setValues({ customer: { address: { city: 'Milano' } } });
        expect(form.fields['customer.address.city'].value()).toBe('Milano');
        expect(form.fields['customer.address.zip'].value(), 'a field the patch does not name').toBe('00100');
        form.reset({ customer: { name: 'Bea' } });
        expect(form.fields['customer.name'].value()).toBe('Bea');
        // @ts-expect-error — a nested key the values do not have
        form.setValues({ customer: { nmae: 'x' } });
    });

    it('leave a form typed by a record what it was: any name, any value', () => {
        type F = Form<Record<string, unknown>>['fields'];
        expectTypeOf<F['anything']>().toEqualTypeOf<FormField<unknown>>();
    });});
