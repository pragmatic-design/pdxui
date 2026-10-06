// A selection can be PUT BACK, not only cleared.
//
// With only `clearSelection()` and `getSelectedIds()`, after a bulk action an application would have
// exactly two choices: keep everything checked, or check nothing. Neither is the answer to a server that accepted nine of twelve — the three that were refused have
// to stay selected, or the next attempt is a re-selection instead of a click.
//
// It is one function because every path that changes the set already ends in the same two calls:
// paint the checkboxes and publish (`grid-selection.ts:20`). A consumer that wrote into
// `gc.selectedIds` itself would get neither.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, any>;

const PEOPLE = [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
    { id: 3, name: 'Katherine' },
];
const COLS = [{ field: 'name', header: 'Name' }];

async function mountGrid(props: Record<string, unknown> = {}): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = COLS;
    el.data = PEOPLE;
    el.selection = 'multiple';
    for (const [k, v] of Object.entries(props)) el[k] = v;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

const rowOf = (el: Grid, id: number) => el.querySelector<HTMLElement>(`.pdx-dg-row[data-row-id="${id}"]`)!;
const boxOf = (el: Grid, id: number) => rowOf(el, id).querySelector<HTMLInputElement>('.pdx-dg-checkbox input')!;

beforeEach(cleanup);

describe('setSelectedIds', () => {
    it('checks exactly those rows, and unchecks the rest', async () => {
        const el = await mountGrid();
        boxOf(el, 1).click();
        boxOf(el, 2).click();
        boxOf(el, 3).click();
        expect(el.getSelectedIds()).toHaveLength(3);

        el.setSelectedIds([2]);

        expect(el.getSelectedIds()).toEqual([2]);
        expect(boxOf(el, 2).checked, 'the row that was kept lost its tick').toBe(true);
        expect(boxOf(el, 1).checked).toBe(false);
        expect(boxOf(el, 3).checked).toBe(false);
        // What a screen reader goes by, which the class alone does not carry.
        expect(rowOf(el, 2).getAttribute('aria-selected')).toBe('true');
        expect(rowOf(el, 1).getAttribute('aria-selected')).toBe('false');
    });

    it('says so ONCE, with the whole set — not once per row', async () => {
        const el = await mountGrid();
        const events: { selected: unknown[]; count: number }[] = [];
        el.addEventListener('pdx-selection-change', (e: Event) => events.push((e as CustomEvent).detail));

        el.setSelectedIds([1, 3]);

        expect(events, 'a set of two published two events').toHaveLength(1);
        expect(events[0]).toEqual({ selected: [1, 3], count: 2 });
    });

    it('leaves the header checkbox saying what it is: some, all, none', async () => {
        const el = await mountGrid();
        const headerCb = el.querySelector<HTMLInputElement>('.pdx-dg-header .pdx-dg-checkbox input')!;

        el.setSelectedIds([1]);
        expect(headerCb.checked).toBe(false);
        expect(headerCb.indeterminate, 'a partial selection did not read as partial').toBe(true);

        el.setSelectedIds([1, 2, 3]);
        expect(headerCb.checked).toBe(true);
        expect(headerCb.indeterminate).toBe(false);

        el.setSelectedIds([]);
        expect(headerCb.checked).toBe(false);
        expect(headerCb.indeterminate).toBe(false);
    });

    it('a single-selection grid takes the last one, not three', async () => {
        const el = await mountGrid({ selection: 'single' });
        el.setSelectedIds([1, 2, 3]);
        expect(el.getSelectedIds(), 'a single-selection grid ended up holding three').toEqual([3]);
    });

    it('an id the grid does not have is not selected', async () => {
        const el = await mountGrid();
        el.setSelectedIds([2, 999]);
        expect(el.getSelectedIds()).toEqual([2]);
    });
});
