// A grid can mark a ROW, not only a cell.
//
// With `cellClass` alone, marking a row means repeating the same function on every column — and
// what comes out is a set of marked CELLS, which is not the same thing: the gaps between them, the
// row's own background and the selection stripe all stay unmarked, and a column the reader hid
// takes its mark with it.
//
// The typical case is an import preview, where a row that cannot be taken has to read as
// refused. It is the same need as "new", "stale", "over budget", and every grid library has it.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, any>;

const ROWS = [
    { id: 1, name: 'Ada', problem: '' },
    { id: 2, name: 'Grace', problem: 'no sector' },
    { id: 3, name: 'Katherine', problem: '' },
];
const COLS = [{ field: 'name', header: 'Name' }, { field: 'problem', header: 'Problem' }];

async function mountGrid(props: Record<string, unknown>): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = COLS;
    el.data = ROWS;
    for (const [k, v] of Object.entries(props)) el[k] = v;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

const rowEls = (el: Grid) => [...el.querySelectorAll<HTMLElement>('.pdx-dg-row')];

beforeEach(cleanup);

describe('rowClass', () => {
    it('marks the rows the function names, and only those', async () => {
        const el = await mountGrid({ rowClass: (row: any) => (row.problem ? 'is-invalid' : '') });
        const classes = rowEls(el).map((r) => r.className);
        expect(classes[0]).not.toContain('is-invalid');
        expect(classes[1], 'the row with a problem was not marked').toContain('is-invalid');
        expect(classes[2]).not.toContain('is-invalid');
        // The mark is on the ROW, which is the whole difference from `cellClass`.
        expect(rowEls(el)[1].querySelectorAll('.is-invalid')).toHaveLength(0);
    });

    it('takes the row AND its index', async () => {
        const el = await mountGrid({ rowClass: (_row: unknown, i: number) => (i % 2 ? 'odd' : 'even') });
        expect(rowEls(el).map((r) => (r.className.includes('odd') ? 'odd' : 'even')))
            .toEqual(['even', 'odd', 'even']);
    });

    it('takes a plain string, for a grid where every row is the same kind', async () => {
        const el = await mountGrid({ rowClass: 'compact dense' });
        for (const r of rowEls(el)) {
            expect(r.classList.contains('compact')).toBe(true);
            expect(r.classList.contains('dense')).toBe(true);
        }
    });

    it('keeps the grid\'s own classes: a marked row is still a row, and still selectable', async () => {
        const el = await mountGrid({ rowClass: 'is-invalid', selection: 'multiple' });
        const row = rowEls(el)[1];
        expect(row.classList.contains('pdx-dg-row'), 'the mark replaced the grid\'s own class').toBe(true);
        row.querySelector<HTMLInputElement>('.pdx-dg-checkbox input')!.click();
        expect(row.classList.contains('pdx-dg-row-selected')).toBe(true);
        expect(row.classList.contains('is-invalid'), 'selecting a marked row lost its mark').toBe(true);
    });

    it('a grid with no rowClass is untouched', async () => {
        const el = await mountGrid({});
        for (const r of rowEls(el)) expect(r.className.trim()).toBe('pdx-dg-row');
    });
});
