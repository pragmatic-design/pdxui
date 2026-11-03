// A row drawn by the `row` snippet can be removed.
//
// The snippet branch of the render loop builds the actions cell too, and the snippet's `remove`
// argument can remove: otherwise a list with a custom row could grow and never shrink, and
// `removable` / `minItems` would have nothing to act on.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm } from '@pdxui/core';
import '../../src/field-list/pdx-field-list';
import { cleanup } from './helpers';

type Row = (item: Record<string, unknown>, index: number, remove: () => void) => Node;

async function snippetList(row: Row, opts: { removable?: boolean } = {}): Promise<HTMLElement & Record<string, unknown>> {
    const form = createForm({ initialValues: { tags: [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }] } });
    const list = document.createElement('pdx-field-list') as HTMLElement & Record<string, unknown>;
    list.setAttribute('name', 'tags');
    if (opts.removable === false) list.setAttribute('removable', 'false');
    list.form = form;
    list.itemFields = [{ name: 'name', type: 'text', label: 'Name' }];
    // What a parent's `@snippet row(item, index, remove) { … }` compiles to: the element's property.
    list.row = row;
    document.body.appendChild(list);
    await vi.waitFor(() => expect(list.querySelectorAll('.pdx-field-list-row')).toHaveLength(3));
    return list;
}

const rowText = (list: HTMLElement) => [...list.querySelectorAll('.pdx-field-list-row .custom-row')].map((r) => r.textContent);
const customRow = (item: Record<string, unknown>) => Object.assign(document.createElement('span'), { className: 'custom-row', textContent: String(item.name) });

describe('pdx-field-list: a row drawn by the row snippet', () => {
    beforeEach(() => cleanup());

    it('gets the remove button, and it removes that row', async () => {
        const list = await snippetList((item) => customRow(item));
        const removes = list.querySelectorAll<HTMLButtonElement>('.pdx-field-list-row button[aria-label="Remove"]');
        expect(removes, 'one remove button per snippet row').toHaveLength(3);
        removes[1].click();
        await vi.waitFor(() => expect(rowText(list)).toEqual(['alpha', 'gamma']));
    });

    it('the snippet gets remove(), for a row that draws its own button', async () => {
        const removes = new Map<number, () => void>();
        const list = await snippetList((item, index, remove) => {
            removes.set(index, remove);
            return customRow(item);
        });
        const first = removes.get(0);
        expect(typeof first).toBe('function');
        first!();
        await vi.waitFor(() => expect(rowText(list)).toEqual(['beta', 'gamma']));
    });

    it('control: removable="false" draws no remove button for a snippet row either', async () => {
        const list = await snippetList((item) => customRow(item), { removable: false });
        expect(list.querySelectorAll('.pdx-field-list-row button[aria-label="Remove"]')).toHaveLength(0);
    });
});
