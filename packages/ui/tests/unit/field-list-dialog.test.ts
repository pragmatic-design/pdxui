// pdx-field-list display="dialog" opens a row in its dialog, and closes it.
//
// The list renders imperatively from one track, which reads the item count, the form, the fields —
// and the dialog state. A track that did not read the dialog state would redraw nothing when opening
// a row sets `_dialogOpen`: a click on a summary cell or on ✎ would do nothing. After "+ Add" the
// dialog would appear, only because adding also changes the count; and then Done and Escape would
// set `_dialogOpen` back, nothing would redraw, and the dialog would stay on screen for good.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm } from '@pdxui/core';
import '../../src/field-list/pdx-field-list';
import { cleanup } from './helpers';

const fields = [
    { name: 'label', type: 'text', label: 'Label' },
    { name: 'city', type: 'text', label: 'City' },
];

async function dialogList(): Promise<HTMLElement> {
    const form = createForm({
        initialValues: { addresses: [{ label: 'Home', city: 'London' }, { label: 'Office', city: 'Cambridge' }] },
    });
    const list = document.createElement('pdx-field-list') as HTMLElement & Record<string, unknown>;
    list.setAttribute('name', 'addresses');
    list.setAttribute('display', 'dialog');
    list.form = form;
    list.itemFields = fields;
    list.itemDefault = { label: '', city: '' };
    document.body.appendChild(list);
    await vi.waitFor(() => expect(list.querySelectorAll('.pdx-field-list-row')).toHaveLength(2));
    return list;
}

const dialog = (list: HTMLElement) => list.querySelector<HTMLElement>('.pdx-field-list-dialog');
const cell = (list: HTMLElement, text: string) =>
    [...list.querySelectorAll<HTMLElement>('.pdx-field-list-cell')].find((c) => c.textContent === text)!;

describe('pdx-field-list display="dialog"', () => {
    beforeEach(() => cleanup());

    it('a click on a summary cell opens that row in the dialog', async () => {
        const list = await dialogList();
        cell(list, 'Cambridge').click();
        await vi.waitFor(() => expect(dialog(list), 'no dialog after a click on the row').not.toBeNull());
        expect(dialog(list)!.textContent).toContain('#2');
        const city = [...dialog(list)!.querySelectorAll('pdx-input')].map((i) => i.getAttribute('value'));
        expect(city).toContain('Cambridge');
    });

    it('the ✎ button opens it too', async () => {
        const list = await dialogList();
        list.querySelector<HTMLButtonElement>('button[aria-label="Edit"]')!.click();
        await vi.waitFor(() => expect(dialog(list)).not.toBeNull());
        expect(dialog(list)!.textContent).toContain('#1');
    });

    it('Done closes it', async () => {
        const list = await dialogList();
        cell(list, 'Home').click();
        await vi.waitFor(() => expect(dialog(list)).not.toBeNull());
        [...dialog(list)!.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
        await vi.waitFor(() => expect(dialog(list), 'Done left the dialog open').toBeNull());
    });

    it('Escape closes it', async () => {
        const list = await dialogList();
        cell(list, 'Home').click();
        await vi.waitFor(() => expect(dialog(list)).not.toBeNull());
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await vi.waitFor(() => expect(dialog(list), 'Escape left the dialog open').toBeNull());
    });

    it('the control: "+ Add" opens the new row in the dialog, and Done closes it', async () => {
        const list = await dialogList();
        [...list.querySelectorAll('button')].find((b) => b.textContent === '+ Add')!.click();
        await vi.waitFor(() => expect(list.querySelectorAll('.pdx-field-list-row')).toHaveLength(3));
        await vi.waitFor(() => expect(dialog(list)).not.toBeNull());
        expect(dialog(list)!.textContent).toContain('#3');
        [...dialog(list)!.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
        await vi.waitFor(() => expect(dialog(list)).toBeNull());
    });
});
