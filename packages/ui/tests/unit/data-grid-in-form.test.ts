// A data grid inside a <form> does not submit it.
//
// A <button> with no type is a submit button. The grid creates many buttons with
// document.createElement('button') — the toolbar's Reload, clear-all, Add and Columns,
// the sort, filter and group chips' ✕, the header's filter icon — and in an order form with its lines
// in a grid, a click on any untyped one would submit the order. Every one of them sets
// type="button"; this guard mounts every feature that renders one and checks them all.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';
import '../../src/pagination/pdx-pagination';

type Grid = HTMLElement & Record<string, unknown> & {
    grid: { sort(field: string): void; source: { setFilter(f: unknown[]): void } };
};

const PEOPLE = [
    { id: 1, name: 'Ada', city: 'Torino', category: 'Books', age: 36 },
    { id: 2, name: 'Grace', city: 'Milano', category: 'Books', age: 45 },
    { id: 3, name: 'Katherine', city: 'Torino', category: 'Music', age: 52 },
];
const COLS = [
    { field: 'name', header: 'Name', sortable: true },
    { field: 'city', header: 'City' },
    { field: 'category', header: 'Category' },
    { field: 'age', header: 'Age', type: 'number' },
];

/** A form holding a grid with its toolbar, a group bar, a group, a sort, a filter and a composite filter. */
async function gridInForm(): Promise<{ form: HTMLFormElement; el: Grid }> {
    const form = document.createElement('form');
    const el = document.createElement('pdx-data-grid') as Grid;
    Object.assign(el, {
        columns: COLS, data: PEOPLE, label: 'People',
        showToolbar: true, showGroupBar: true, groupBy: [{ field: 'category' }],
        editable: true, editMode: 'batch', selection: 'multiple', expandable: true,
    });
    form.appendChild(el);
    document.body.appendChild(form);
    await tick(40);
    await tick(20);
    el.grid.sort('name');
    el.grid.source.setFilter([
        { field: 'city', operator: 'eq', value: 'Torino' },
        { logic: 'or', filters: [{ field: 'age', operator: 'gt', value: 30 }, { field: 'age', operator: 'lt', value: 60 }] },
    ]);
    await tick(20);
    return { form, el };
}

describe('pdx-data-grid inside a form', () => {
    beforeEach(cleanup);

    it('every button the grid renders is type="button"', async () => {
        const { el } = await gridInForm();
        const buttons = [...el.querySelectorAll('button')];
        // The features really rendered: the chips of a sort, a filter and a composite filter, a group chip.
        expect(el.querySelectorAll('.pdx-dg-toolbar-chip-remove').length, 'sort, filter, composite and group chips').toBeGreaterThanOrEqual(4);
        expect(el.querySelector('.pdx-dg-filter-icon'), 'a header filter icon').not.toBeNull();
        const submitting = buttons
            .filter((b) => b.getAttribute('type') !== 'button')
            .map((b) => b.className || b.getAttribute('aria-label') || b.textContent!.trim());
        expect(submitting).toEqual([]);
    });

    it('a click on Reload, Columns or a chip\'s ✕ does not submit the form', async () => {
        const { form, el } = await gridInForm();
        let submits = 0;
        form.addEventListener('submit', (e) => { submits++; e.preventDefault(); });
        const reload = el.querySelector('.pdx-dg-toolbar [aria-label="Reload"]') as HTMLButtonElement;
        const columns = el.querySelector('.pdx-dg-toolbar [aria-label="Columns"]') as HTMLButtonElement;
        const chip = el.querySelector('.pdx-dg-toolbar-chip-remove') as HTMLButtonElement;
        for (const b of [reload, columns, chip]) {
            b.click();
            await tick();
        }
        expect(submits).toBe(0);
    });
});
