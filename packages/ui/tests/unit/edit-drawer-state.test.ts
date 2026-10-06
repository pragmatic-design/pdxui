// pdx-edit-drawer: New after an Edit is new, the next entity does not inherit the last one's fields,
// and a failed save puts focus on the first invalid field.
//
// form.reset MERGES its argument into the snapshot, so a form reused across opens and reset with
// `value ?? {}` keeps the last entity: Edit Alice, Cancel, New would show "Alice Johnson" under the
// title "New", and saving would create a second Alice. A failed save that left focus on Save would
// tell a keyboard or screen-reader user nothing about where the error is.
import { describe, it, expect, beforeEach } from 'vitest';
import type { FormSchema } from '@pdxui/core';
import '../../src/edit-drawer/pdx-edit-drawer';
import { tick, cleanup } from './helpers';

const SCHEMA: FormSchema = {
    fields: [
        { name: 'name', type: 'text', label: 'Name', required: true },
        { name: 'role', type: 'text', label: 'Role' },
        { name: 'phone', type: 'text', label: 'Phone' },
    ],
};

type EditDrawer = HTMLElement & { schema: unknown; value: unknown; open: boolean };

async function mountDrawer(): Promise<EditDrawer> {
    const el = document.createElement('pdx-edit-drawer') as EditDrawer;
    el.schema = SCHEMA;
    document.body.appendChild(el);
    await tick();
    return el;
}
async function openWith(el: EditDrawer, value: unknown): Promise<void> {
    el.value = value;
    el.open = true;
    await tick(); await tick();
}
async function close(el: EditDrawer): Promise<void> {
    el.open = false;
    await tick();
}
const input = (name: string) =>
    document.querySelector<HTMLInputElement>(`.pdx-edit-drawer-body pdx-form-field[name="${name}"] input`)!;

beforeEach(cleanup);

describe('pdx-edit-drawer state between opens', () => {
    it('New after an Edit shows empty fields', async () => {
        const el = await mountDrawer();
        await openWith(el, { name: 'Alice Johnson', role: 'Engineer' });
        expect(input('name').value, 'the control: the edit loaded Alice').toBe('Alice Johnson');
        await close(el);
        await openWith(el, null);
        expect(input('name').value).toBe('');
        expect(input('role').value).toBe('');
        expect((el as unknown as { getValues(): Record<string, unknown> }).getValues().name ?? '').toBe('');
    });

    it('editing another entity does not keep the fields the first one had and the second lacks', async () => {
        const el = await mountDrawer();
        await openWith(el, { name: 'Alice', role: 'Engineer', phone: '555-0101' });
        await close(el);
        await openWith(el, { name: 'Bob', role: 'Designer' });
        expect(input('name').value).toBe('Bob');
        expect(input('phone').value).toBe('');
    });
});

describe('pdx-edit-drawer failed save', () => {
    it('focuses the first invalid field', async () => {
        const el = await mountDrawer();
        await openWith(el, null);
        const save = [...document.querySelectorAll<HTMLButtonElement>('button.pdx-primary')].find(b => b.textContent?.trim() === 'Save')!;
        save.focus();
        let saved = false;
        el.addEventListener('pdx-save', () => { saved = true; });
        save.click();
        await tick(40);
        expect(saved, 'an empty required field must not save').toBe(false);
        expect(document.activeElement).toBe(input('name'));
    });
});

describe('pdx-edit-drawer focus return (through the drawer it wraps)', () => {
    it('Cancel returns focus to the opener', async () => {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        const el = await mountDrawer();
        el.addEventListener('pdx-cancel', () => { el.open = false; });
        opener.focus();
        await openWith(el, { name: 'Alice' });
        const cancel = [...document.querySelectorAll<HTMLButtonElement>('button.pdx-ghost')].find(b => b.textContent?.trim() === 'Cancel')!;
        cancel.focus();
        cancel.click();
        await tick(50);
        expect(document.activeElement).toBe(opener);
    });
});
