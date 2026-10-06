// A command column (`command: true`, e.g. row actions) has nothing to filter, resize, reorder or
// hide: ColumnDef documents that it "auto-disables sort/filter/resize/reorder", and every one of
// them is read, not only sort — otherwise an actions column shows a filter button named "Filter ".

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { actions } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, unknown>;

const DATA = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }];
const COLS = [
    { field: 'name', header: 'Name' },
    { field: '__actions', header: 'Actions', command: true, cell: actions([{ label: 'Open', onClick: () => {} }]) },
];

async function mountGrid(props: Record<string, unknown>): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    Object.assign(el, { columns: COLS, data: DATA }, props);
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}
const header = (el: Element, text: string) =>
    [...el.querySelectorAll('[role="columnheader"]')].find(h => h.textContent?.trim().startsWith(text)) as HTMLElement;

beforeEach(cleanup);

describe('a command column', () => {
    it('has no filter button, no resize handle and is not draggable', async () => {
        const el = await mountGrid({});
        const name = header(el, 'Name'), cmd = header(el, 'Actions');
        expect(name.querySelector('.pdx-dg-filter-icon')).not.toBeNull();
        expect(cmd.querySelector('.pdx-dg-filter-icon')).toBeNull();
        expect(name.querySelector('.pdx-dg-resize-handle')).not.toBeNull();
        expect(cmd.querySelector('.pdx-dg-resize-handle')).toBeNull();
        expect(name.draggable).toBe(true);
        expect(cmd.draggable).not.toBe(true);
    });

    it('has an empty cell in the filter row', async () => {
        const el = await mountGrid({ filterable: true });
        const cells = [...el.querySelectorAll('.pdx-dg-filter-row .pdx-dg-filter-cell')];
        expect(cells).toHaveLength(2);
        expect(cells[0].children.length).toBeGreaterThan(0);
        expect(cells[1].children).toHaveLength(0);
    });

    it('is not in the column chooser', async () => {
        const el = await mountGrid({ showToolbar: true });
        (el.querySelector('.pdx-dg-toolbar [aria-label="Columns"]') as HTMLButtonElement).click();
        await tick();
        const names = [...document.querySelectorAll('.pdx-dg-col-menu input[type="checkbox"]')].map(c => c.getAttribute('aria-label'));
        expect(names).toEqual(['Name']);
    });
});
