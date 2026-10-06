// A row added by `<pdx-field-list>` has to reach the ARRAY FIELD, not only the dotted paths.
//
// The list keeps its rows as `lines.0.activity`, `lines.1.activity`… and `getValues()` assembles
// them, so the payload is right either way. The leaf field the array itself is — `form.fields.lines`
// — must be updated too, or every consumer that reads it sees an empty array while rows are on
// screen. `form.ts:646` describes the arrangement as "`<pdx-field-list>` keeps its rows as dotted
// fields AND MIRRORS THEM onto the array field".
//
// It is not a cosmetic gap. On the showcase's intake wizard a missing mirror costs two things at
// once: the Billing step says "0 activities" with a row in the list, and the guard that must refuse
// to leave a step with an empty required cell reads `intake.fields.lines.value()`, gets `[]`, has
// nothing to check, and lets the step through — so `required` on a row's field would be
// unenforceable from outside the row.
//
// A leaf only exists when the array was seeded EMPTY (`flattenValues` leaves `[]` as a leaf and
// expands a filled array into dotted paths), which is why a fixture that starts with rows cannot
// show it: it has no leaf to be wrong.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm } from '@pdxui/core';
import '../../src/field-list/pdx-field-list';
import { cleanup } from './helpers';

type Row = Record<string, unknown>;

async function emptyList(): Promise<{ list: HTMLElement; form: ReturnType<typeof createForm> }> {
    const form = createForm<Record<string, unknown>>({ initialValues: { lines: [] as Row[] } });
    const list = document.createElement('pdx-field-list') as HTMLElement & Record<string, unknown>;
    list.setAttribute('name', 'lines');
    list.form = form;
    list.itemFields = [
        { name: 'activity', type: 'text', label: 'Activity', required: true },
        { name: 'hours', type: 'number', label: 'Hours' },
    ];
    list.itemDefault = { activity: '', hours: 1 };
    document.body.appendChild(list);
    // The list is drawn before anything is asserted about it: its render is a tracked effect.
    await vi.waitFor(() => expect(list.querySelector('.pdx-field-list')).toBeTruthy());
    return { list, form };
}

const addButton = (list: HTMLElement) =>
    [...list.querySelectorAll<HTMLButtonElement>('button')].find(b => /add/i.test(b.textContent ?? ''))!;

const rows = (list: HTMLElement) => list.querySelectorAll('.pdx-field-list-row');

/** The array field's own value — what a count, a summary or a step guard reads. */
const arrayValue = (form: ReturnType<typeof createForm>): Row[] =>
    (form.fields.lines?.value() ?? []) as Row[];

describe('pdx-field-list: the rows reach the array field, not only the dotted paths', () => {
    beforeEach(() => cleanup());

    it('the array field holds the row that was added', async () => {
        const { list, form } = await emptyList();
        expect(arrayValue(form), 'the fixture must start empty, or this proves nothing').toHaveLength(0);

        addButton(list).click();
        await vi.waitFor(() => expect(rows(list)).toHaveLength(1));

        expect(arrayValue(form), 'the row is on screen and the array field does not know')
            .toHaveLength(1);
        expect(arrayValue(form)[0], 'the row does not carry the defaults it was added with')
            .toEqual({ activity: '', hours: 1 });
    });

    it('what is typed into a row reaches the array field', async () => {
        const { list, form } = await emptyList();
        addButton(list).click();
        await vi.waitFor(() => expect(rows(list)).toHaveLength(1));

        form.fields['lines.0.activity'].onChange('Survey');

        await vi.waitFor(() => expect(arrayValue(form)[0]).toEqual({ activity: 'Survey', hours: 1 }));
    });

    it('removing the row empties it again', async () => {
        const { list, form } = await emptyList();
        addButton(list).click();
        await vi.waitFor(() => expect(rows(list)).toHaveLength(1));

        list.querySelector<HTMLButtonElement>('.pdx-field-list-row button[aria-label="Remove"]')!.click();
        await vi.waitFor(() => expect(rows(list)).toHaveLength(0));

        expect(arrayValue(form), 'the removed row is still in the array field').toHaveLength(0);
    });

    it('control — the payload is unchanged: getValues() still assembles the rows', async () => {
        // The mirror must not become a second source of truth. `getValues()` skips a leaf that has
        // dotted children (form.ts:636) precisely so that it cannot: a stale leaf overwriting real
        // rows would send a filled-in row to the server as nothing.
        const { list, form } = await emptyList();
        addButton(list).click();
        await vi.waitFor(() => expect(rows(list)).toHaveLength(1));
        form.fields['lines.0.activity'].onChange('Survey');

        expect((form.getValues() as { lines: Row[] }).lines).toEqual([{ activity: 'Survey', hours: 1 }]);
    });
});
