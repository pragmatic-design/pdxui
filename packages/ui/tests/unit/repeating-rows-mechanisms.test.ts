// The two ways to build a repeating group of fields, measured side by side.
//
// `createFieldArray` (and `form.array('items')`, which is the same object) and `<pdx-field-list>`
// both manage "add another line", and they do NOT share an implementation.
//
// This file is the measurement the page rests on, so the prose cannot drift from the code:
//
//   createFieldArray   items are `{ __id, value }` wrappers; a row is addressed by its __id, which
//                      survives a removal. No UI: you draw everything.
//   pdx-field-list     rows are DOTTED PATHS in the form (`items.0.name`); a row is addressed by
//                      its index, and removing one re-indexes every row after it — the form moves
//                      each row's value, error, touched and dirty along with it.
//
// And the fact that decides whether you can mix them: they are two storages, and under one name the
// field array wins.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm, createFieldArray, FORM_INTERNALS } from '@pdxui/core';
import '../../src/field-list/pdx-field-list';
import { cleanup } from './helpers';

describe('createFieldArray: a row is addressed by a key that survives', () => {
    it('removing a row leaves the others their identity', () => {
        const rooms = createFieldArray([{ type: 'kitchen' }, { type: 'bath' }, { type: 'study' }]);
        const [, second, third] = rooms.items().map(i => i.__id);
        rooms.remove(0);
        expect(rooms.items().map(i => i.__id), 'the surviving rows were re-keyed').toEqual([second, third]);
        expect(rooms.getValues()).toEqual([{ type: 'bath' }, { type: 'study' }]);
    });

    it('inside a form it is form.array(name), and its values reach getValues()', () => {
        const form = createForm({ initialValues: { rooms: [{ type: 'kitchen' }] } });
        form.array('rooms').append({ type: 'bath' });
        expect((form.getValues() as { rooms: unknown[] }).rooms).toEqual([{ type: 'kitchen' }, { type: 'bath' }]);
    });
});

describe('pdx-field-list: a row is addressed by its index, and the index moves', () => {
    beforeEach(() => cleanup());

    async function list(): Promise<{ el: HTMLElement; form: ReturnType<typeof createForm>; paths: () => string[] }> {
        const form = createForm<Record<string, unknown>>({ initialValues: { rooms: [{ type: 'kitchen' }, { type: 'bath' }, { type: 'study' }] } });
        const el = document.createElement('pdx-field-list') as HTMLElement & Record<string, unknown>;
        el.setAttribute('name', 'rooms');
        el.form = form;
        el.itemFields = [{ name: 'type', type: 'text', label: 'Type' }];
        document.body.appendChild(el);
        await vi.waitFor(() => expect(el.querySelectorAll('.pdx-field-list-row')).toHaveLength(3));
        const internals = (form as unknown as Record<symbol, { getFieldPaths(): string[] }>)[FORM_INTERNALS];
        return { el, form, paths: () => internals.getFieldPaths().filter(p => p.startsWith('rooms.')).sort() };
    }

    it('the rows are dotted paths in the form, not wrappers', async () => {
        const { paths } = await list();
        expect(paths()).toEqual(['rooms.0.type', 'rooms.1.type', 'rooms.2.type']);
    });

    it('removing a row re-indexes the ones after it, and their values follow', async () => {
        const { el, form, paths } = await list();
        const remove = el.querySelectorAll<HTMLButtonElement>('.pdx-field-list-row button[aria-label="Remove"]');
        remove[0].click();
        await vi.waitFor(() => expect(el.querySelectorAll('.pdx-field-list-row')).toHaveLength(2));

        // The paths shift down — `rooms.2` no longer exists — and this is the difference from the
        // primitive: there is no key that stays put, so a row cannot be referred to across a removal.
        expect(paths()).toEqual(['rooms.0.type', 'rooms.1.type']);
        // What was in row 1 and 2 is now in row 0 and 1: `renameFields` moves the value, the error,
        // the touched and the dirty flags along with the name (form.ts:761).
        expect((form.getValues() as { rooms: { type: string }[] }).rooms.map(r => r.type)).toEqual(['bath', 'study']);
    });
});

describe('they are two storages, and under one name the array wins', () => {
    beforeEach(() => cleanup());

    it('an edit made through the field list is lost the moment form.array() exists', async () => {
        // The question that decides whether the two can be mixed. `getValues()` merges the field
        // arrays back in LAST (form.ts:558), so the dotted paths the list maintains are overwritten
        // by the array's own contents — and the array seeds itself from `initialValues`, not from
        // what the list has since written. Nothing warns.
        const form = createForm<Record<string, unknown>>({ initialValues: { rooms: [{ type: 'kitchen' }] } });
        const el = document.createElement('pdx-field-list') as HTMLElement & Record<string, unknown>;
        el.setAttribute('name', 'rooms');
        el.form = form;
        el.itemFields = [{ name: 'type', type: 'text', label: 'Type' }];
        document.body.appendChild(el);
        await vi.waitFor(() => expect(el.querySelectorAll('.pdx-field-list-row')).toHaveLength(1));

        form.fields['rooms.0.type'].onChange('edited in the list');
        expect((form.getValues() as { rooms: { type: string }[] }).rooms[0].type,
            'the edit did not reach getValues() at all').toBe('edited in the list');

        // One call to form.array() on the same name, and the edit is gone.
        form.array('rooms');
        expect((form.getValues() as { rooms: { type: string }[] }).rooms[0].type,
            'the two storages coexist after all').toBe('kitchen');
    });
});

// `FieldListItemSchema` carries `required?: boolean`, and a row field declared required is enforced:
// `validate()` returns false on an empty one, because a form that says a value is mandatory and saves
// without it is worse than one that never asked.
describe('a required row field is enforced', () => {
    beforeEach(() => cleanup());

    /** A list whose rows carry one required field and one that is not. */
    async function requiredList(initial: Record<string, unknown>[]): Promise<{
        el: HTMLElement; form: ReturnType<typeof createForm>;
    }> {
        const form = createForm<Record<string, unknown>>({ initialValues: { lines: initial } });
        const el = document.createElement('pdx-field-list') as HTMLElement & Record<string, unknown>;
        el.setAttribute('name', 'lines');
        el.form = form;
        el.itemFields = [
            { name: 'product', type: 'text', label: 'Product', required: true },
            { name: 'note', type: 'text', label: 'Note' },
        ];
        document.body.appendChild(el);
        await vi.waitFor(() => expect(el.querySelectorAll('.pdx-field-list-row')).toHaveLength(initial.length));
        return { el, form };
    }

    it('an empty required field in an existing row fails validation', async () => {
        const { form } = await requiredList([{ product: '', note: '' }]);
        expect(await form.validate(), 'the row was accepted with its required field empty').toBe(false);
        expect(form.errors()['lines.0.product'], 'no error was recorded against the path').toBeTruthy();
    });

    it('and passes once it is filled', async () => {
        const { form } = await requiredList([{ product: 'Widget', note: '' }]);
        expect(await form.validate(), 'a filled row was rejected').toBe(true);
    });

    it('a row added by the Add button is validated too, not only the initial ones', async () => {
        const { el, form } = await requiredList([{ product: 'Widget', note: '' }]);
        expect(await form.validate()).toBe(true);

        const add = el.querySelector<HTMLButtonElement>('.pdx-field-list-add, button[data-action="add"]')
            ?? [...el.querySelectorAll('button')].find(b => /add/i.test(b.textContent ?? ''))!;
        add.click();
        await vi.waitFor(() => expect(el.querySelectorAll('.pdx-field-list-row')).toHaveLength(2));

        expect(await form.validate(), 'the row added at runtime carries no validator').toBe(false);
    });

    it('a field that is not required is left alone', async () => {
        const { form } = await requiredList([{ product: 'Widget', note: '' }]);
        await form.validate();
        expect(form.errors()['lines.0.note'], 'an optional field was reported as missing').toBeFalsy();
    });
});
