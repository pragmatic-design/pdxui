// The selection cell is the checkbox's hit area, and never opens the row.
//
// The cell that holds the checkbox must not open the detail, not only the check. A checkbox that
// stops its own click inside a cell that does not lets a click beside the 16px box reach the row,
// which emits `pdx-row-click` — and an app opens the record on it: aiming at the checkbox and
// missing by a few pixels would open the record.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, unknown>;
const ROWS = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

async function mountGrid(virtual: boolean): Promise<{ el: Grid; opened: number[] }> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = [{ field: 'name', header: 'Name' }];
    el.data = ROWS.map(r => ({ ...r }));
    el.selection = 'multiple';
    if (virtual) { el.virtualScroll = true; el.rowHeight = 36; el.maxHeight = 400; }
    const opened: number[] = [];
    el.addEventListener('pdx-row-click', (e) => opened.push((e as CustomEvent).detail.id));
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return { el, opened };
}

const bodyRow = (el: Element, id: number) => el.querySelector(`.pdx-dg-body [data-row-id="${id}"]`) as HTMLElement;
const selectCell = (el: Element, id: number) => bodyRow(el, id).querySelector('.pdx-dg-checkbox') as HTMLElement;
const checkbox = (el: Element, id: number) => selectCell(el, id).querySelector('input') as HTMLInputElement;

for (const virtual of [false, true]) {
    describe(`the selection cell${virtual ? ', virtualised' : ''}`, () => {
        beforeEach(cleanup);

        it('a click beside the checkbox selects the row and does not open it', async () => {
            const { el, opened } = await mountGrid(virtual);
            expect(bodyRow(el, 2), 'the premise: the row is rendered').not.toBeNull();
            selectCell(el, 2).click();
            await tick(20);
            expect(opened, 'the row opened: pdx-row-click from the selection cell').toEqual([]);
            expect(checkbox(el, 2).checked, 'the row was not selected').toBe(true);

            selectCell(el, 2).click();
            await tick(20);
            expect(checkbox(el, 2).checked, 'a second click did not unselect it').toBe(false);
            expect(opened).toEqual([]);
        });

        it('control — a click on a data cell still opens the row', async () => {
            const { el, opened } = await mountGrid(virtual);
            (bodyRow(el, 3).querySelector('[data-field="name"]') as HTMLElement).click();
            await tick(20);
            expect(opened).toEqual([3]);
        });
    });
}
