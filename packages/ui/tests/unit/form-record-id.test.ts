// pdx-form loads the record `record-id` names when the DataSource's ids are numbers.
//
// `recordId` is a String prop: a strict comparison never finds `{ id: 1 }` for `record-id="1"`, the
// form stays empty and Save updates a record it never loaded. pdx-form and pdx-auto-form look the
// record up through one helper.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDataSource, createForm } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/form/pdx-form';

async function formOver(data: Record<string, unknown>[], recordId: string) {
    const ds = createDataSource({ data, pageSize: 0 });
    const form = createForm<{ name: string }>({ initialValues: { name: '' } });
    const el = document.createElement('pdx-form') as HTMLElement & { form: unknown; source: unknown };
    document.body.appendChild(el);
    await tick(50);
    el.form = form;
    el.source = ds;
    el.setAttribute('record-id', recordId);
    await tick(30);
    return { form, ds };
}

describe('pdx-form record-id', () => {
    beforeEach(cleanup);

    it('record-id="1" loads the record whose id is the number 1', async () => {
        const { form } = await formOver([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], '1');
        await vi.waitFor(() => expect(form.getValues()).toMatchObject({ name: 'A' }));
    });

    it('the control: string ids still match as written', async () => {
        const { form } = await formOver([{ id: 'u-7', name: 'Carol' }], 'u-7');
        await vi.waitFor(() => expect(form.getValues()).toMatchObject({ name: 'Carol' }));
    });

    it('a record that arrives after the form mounted is still loaded', async () => {
        // The lookup reads the source's data reactively: a record added later must reach the form.
        const { form, ds } = await formOver([], '1');
        expect(form.getValues()).toMatchObject({ name: '' });
        ds.add({ id: 1, name: 'Late' });
        await vi.waitFor(() => expect(form.getValues()).toMatchObject({ name: 'Late' }));
    });
});
