// A nested field's validator is declared against its dotted path — and the type says so (#467).
//
// `createForm` flattens `{ customer: { name } }` into the field `customer.name`, and the runtime looks
// validators up by that name; the tests that proved it (form-nested, form-more) had to cast the
// config to compile, because `validators` only took the top-level keys. The site's form demos, typed
// against the real package, reported exactly that error. `pnpm typecheck` compiles this file: the
// cases below are the type test, and the run checks the runtime is the one described.

import { describe, it, expect, expectTypeOf } from 'vitest';
import { createForm, required } from '../src/index';
import type { FormConfig } from '../src/form/form';

type Order = { reference: string; customer: { name: string; email: string; address: { city: string } }; lines: { qty: number }[] };

describe('validators keyed by a dotted path', () => {
    it('compile with no cast, and run against the nested field', async () => {
        const form = createForm({
            initialValues: { reference: '', customer: { name: '', email: '', address: { city: '' } }, lines: [] } as Order,
            validators: {
                reference: [required()],
                'customer.name': [required()],
                'customer.address.city': [(v: string) => (v ? undefined : 'City')],
            },
        });
        expect(await form.validate()).toBe(false);
        // Read whole: `errors()` is still typed by the top-level keys (its nested typing is #470).
        expect(form.errors()).toMatchObject({ 'customer.name': expect.any(String), 'customer.address.city': 'City' });
    });

    it('type each path by the value it reaches, and know no other', () => {
        type V = NonNullable<FormConfig<Order>['validators']>;
        expectTypeOf<V['customer.address.city']>().toEqualTypeOf<((value: string) => ReturnType<NonNullable<V['reference']>[number]>)[] | undefined>();
        // An array is a field array, not a group of fields: its items are not paths here.
        expectTypeOf<V>().not.toHaveProperty('lines.0');
        // @ts-expect-error — not a field of the form
        const wrong: V = { 'customer.nmae': [required()] };
        void wrong;
    });
});
