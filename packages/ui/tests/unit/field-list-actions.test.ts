// A row drawn by the `row` slot can be removed.
//
// The slot branch of the render loop builds the actions cell too, and the slot's scope can remove:
// otherwise a list with a custom row could grow and never shrink, and `removable` / `minItems` would
// have nothing to act on.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm } from '@pdxui/core';
import '../../src/field-list/pdx-field-list';
import { cleanup } from './helpers';

type Scope = { item: Record<string, unknown>; index: number; remove?: () => void };

async function slotList(slot: (scope: Scope) => Node, opts: { removable?: boolean } = {}): Promise<HTMLElement & Record<string, unknown>> {
    const form = createForm({ initialValues: { tags: [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }] } });
    const list = document.createElement('pdx-field-list') as HTMLElement & Record<string, unknown>;
    list.setAttribute('name', 'tags');
    if (opts.removable === false) list.setAttribute('removable', 'false');
    list.form = form;
    list.itemFields = [{ name: 'name', type: 'text', label: 'Name' }];
    // What a parent's <template #row> provides: the element's scoped-slot function for `row`.
    (list as unknown as { _slotFunctions: Record<string, unknown> })._slotFunctions.row = slot;
    document.body.appendChild(list);
    await vi.waitFor(() => expect(list.querySelectorAll('.pdx-field-list-row')).toHaveLength(3));
    return list;
}

const rowText = (list: HTMLElement) => [...list.querySelectorAll('.pdx-field-list-row .custom-row')].map((r) => r.textContent);

describe('pdx-field-list: a row drawn by the row slot', () => {
    beforeEach(() => cleanup());

    it('gets the remove button, and it removes that row', async () => {
        const list = await slotList(({ item }) => Object.assign(document.createElement('span'), { className: 'custom-row', textContent: String(item.name) }));
        const removes = list.querySelectorAll<HTMLButtonElement>('.pdx-field-list-row button[aria-label="Remove"]');
        expect(removes, 'one remove button per slot row').toHaveLength(3);
        removes[1].click();
        await vi.waitFor(() => expect(rowText(list)).toEqual(['alpha', 'gamma']));
    });

    it('the slot scope has remove(), for a row that draws its own button', async () => {
        let scopes: Scope[] = [];
        const list = await slotList((scope) => {
            scopes.push(scope);
            return Object.assign(document.createElement('span'), { className: 'custom-row', textContent: String(scope.item.name) });
        });
        const first = scopes.find((s) => s.index === 0)!;
        expect(typeof first.remove).toBe('function');
        scopes = [];
        first.remove!();
        await vi.waitFor(() => expect(rowText(list)).toEqual(['beta', 'gamma']));
    });

    it('control: removable="false" draws no remove button for a slot row either', async () => {
        const list = await slotList(({ item }) => Object.assign(document.createElement('span'), { className: 'custom-row', textContent: String(item.name) }), { removable: false });
        expect(list.querySelectorAll('.pdx-field-list-row button[aria-label="Remove"]')).toHaveLength(0);
    });
});
