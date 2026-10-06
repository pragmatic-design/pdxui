// pdx-auto-form loads the record `record-id` names when the DataSource's ids are numbers.
//
// `recordId` is a String prop, and DataSource.getById compares strictly: compared as written,
// `record-id="1"` would never find `{ id: 1 }`. The form would render empty, and Save — which looks
// the record up the same way to update it — would do nothing.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDataSource } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/auto-form/pdx-auto-form';

const FIELDS = [
    { field: 'name', label: 'Name', type: 'text' },
    { field: 'role', label: 'Role', type: 'text' },
];

async function autoForm(data: Record<string, unknown>[], recordId: string) {
    const ds = createDataSource({ data, pageSize: 0 });
    const el = document.createElement('pdx-auto-form') as HTMLElement & {
        fields: unknown; source: unknown; form: { getValues(): Record<string, unknown> } | null;
    };
    document.body.appendChild(el);
    await tick();
    el.fields = FIELDS;
    el.source = ds;
    el.setAttribute('record-id', recordId);
    await tick(30);
    return { el, ds };
}

describe('pdx-auto-form record-id', () => {
    beforeEach(cleanup);

    it('record-id="1" loads the record whose id is the number 1', async () => {
        const { el } = await autoForm([{ id: 1, name: 'Alice', role: 'Engineer' }, { id: 2, name: 'Bob', role: 'Designer' }], '1');
        await vi.waitFor(() => expect(el.form?.getValues()).toMatchObject({ name: 'Alice', role: 'Engineer' }));
    });

    it('Save updates that record in the DataSource', async () => {
        const { el, ds } = await autoForm([{ id: 1, name: 'Alice', role: 'Engineer' }], '1');
        await vi.waitFor(() => expect(el.form?.getValues()).toMatchObject({ name: 'Alice' }));
        (el.form as unknown as { fields: Record<string, { onChange(v: unknown): void }> }).fields.name.onChange('Alicia');
        const save = [...el.querySelectorAll('pdx-button')].find((b) => b.getAttribute('variant') === 'primary') as HTMLElement;
        save.click();
        await vi.waitFor(() => expect(ds.getById(1)).toMatchObject({ name: 'Alicia' }));
    });

    it('the control: string ids still match as written', async () => {
        const { el } = await autoForm([{ id: 'u-7', name: 'Carol', role: 'PM' }], 'u-7');
        await vi.waitFor(() => expect(el.form?.getValues()).toMatchObject({ name: 'Carol' }));
    });
});
