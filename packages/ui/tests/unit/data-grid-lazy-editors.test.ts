// pdx-data-grid loads its editors when a grid can use them, not with the grid (#407).
//
// The grid creates pdx-input, pdx-number-input, pdx-select, pdx-date-picker, pdx-form-field and
// pdx-dialog only when someone edits a cell, filters a column or opens the edit dialog. It used to
// import all six with itself, so a list that never edits fetched ~40 KB of editors before its first
// screen. Now a grid that neither edits nor filters loads none of them; one that does loads them
// when the browser is idle, before the first edit asks; and an editor created before its module has
// arrived is upgraded when it does, and takes the focus then.
//
// This file is its own module graph: it imports nothing but the grid, and the cases run in order —
// the first asserts what is NOT loaded before a later one loads it.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

const EDITORS = ['pdx-input', 'pdx-number-input', 'pdx-select', 'pdx-date-picker', 'pdx-form-field', 'pdx-dialog'];
const COLUMNS = [{ field: 'name', header: 'Name' }, { field: 'age', header: 'Age', type: 'number' }];
const ROWS = [{ id: 1, name: 'Ada', age: 36 }, { id: 2, name: 'Grace', age: 41 }];

type Grid = HTMLElement & { columns: unknown; data: unknown; editable: boolean; filterable: boolean; whenReady(): Promise<void> };

async function mount(props: Partial<Grid>): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    Object.assign(el, { columns: COLUMNS, data: ROWS.map(r => ({ ...r })) }, props);
    document.body.appendChild(el);
    await el.whenReady();
    // The rows land a moment after the build, as in data-grid-lazy-icon.test.ts.
    await vi.waitFor(() => expect(el.textContent).toContain('Grace'));
    return el;
}

const defined = () => EDITORS.filter(tag => customElements.get(tag));

describe('pdx-data-grid and its editors', () => {
    beforeEach(cleanup);

    it('a grid that neither edits nor filters loads none of them', async () => {
        await mount({});
        await tick(200);
        expect(defined(), 'editors loaded by a grid that cannot use them').toEqual([]);
    });

    it('an editable grid loads them when idle, before any edit', async () => {
        await mount({ editable: true });
        await vi.waitFor(() => expect(defined()).toEqual(EDITORS), { timeout: 5000 });
    });

    it('a double-clicked cell gets its editor, focused', async () => {
        const el = await mount({ editable: true });
        el.querySelector<HTMLElement>('.pdx-dg-row[data-row-id="1"] .pdx-dg-td[data-field="name"]')!
            .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await vi.waitFor(() => {
            const input = el.querySelector<HTMLInputElement>('.pdx-dg-cell-editing pdx-input input');
            expect(input, 'no editor in the edited cell').toBeTruthy();
            expect(document.activeElement).toBe(input);
        }, { timeout: 5000 });
    });
});
