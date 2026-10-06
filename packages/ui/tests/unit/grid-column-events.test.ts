// The grid says when its columns are rearranged.
//
// A reader can reorder a column, hide one and drag a border. Without a column event an application
// can ASK (`el.grid.saveState()`) and never know WHEN to ask.
//
// Saved views need it: a view holds the filter, the sort, the column order and the page size, three
// of those are DataSource signals a page can watch, and the fourth is the grid's own. So a view
// saves and restores the column order, and only the event lets it mark itself changed when a
// column moves. Reading the grid's `columns()` from a page is the other way and is not one: the
// grid disposes and rebuilds its composable, and a subscription held across that points at a dead
// computed.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, any>;

const PEOPLE = [{ id: 1, name: 'Ada', city: 'Torino' }];
const COLS = [
    { field: 'name', header: 'Name' },
    { field: 'city', header: 'City' },
    { field: 'note', header: 'Note' },
];

async function mountGrid(): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = COLS;
    el.data = PEOPLE;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

/** Record one event name's details, in order. */
function record(el: Grid, name: string): Record<string, unknown>[] {
    const seen: Record<string, unknown>[] = [];
    el.addEventListener(name, (e: Event) => seen.push((e as CustomEvent).detail));
    return seen;
}

beforeEach(cleanup);

describe('the grid reports what a reader did to its columns', () => {
    it('a reorder says which column moved, and what the order is now', async () => {
        const el = await mountGrid();
        const seen = record(el, 'pdx-column-reorder');

        el.grid.reorder('note', 'name');

        expect(seen, 'moving a column said nothing').toHaveLength(1);
        expect(seen[0].field).toBe('note');
        expect(seen[0].columnOrder, 'the payload does not carry the order it produced')
            .toEqual(['note', 'name', 'city']);
    });

    it('a hide says which column and whether it is showing, and so does showing it again', async () => {
        const el = await mountGrid();
        const seen = record(el, 'pdx-column-visibility-change');

        el.grid.toggleColumn('city');
        el.grid.toggleColumn('city');

        expect(seen).toHaveLength(2);
        expect(seen[0]).toMatchObject({ field: 'city', visible: false });
        expect(seen[1]).toMatchObject({ field: 'city', visible: true });
        // The whole map too: an application keeping a view wants the state, not a diff to apply.
        expect((seen[1].columnVisibility as Record<string, boolean>).city).toBe(true);
    });

    it('a resize says which column and how wide it ended up', async () => {
        const el = await mountGrid();
        const seen = record(el, 'pdx-column-resize');

        el.grid.resize('name', 240);

        expect(seen).toHaveLength(1);
        expect(seen[0].field).toBe('name');
        // The CLAMPED width, not the one that was asked for: min/max are the column's, and an
        // application that wrote down the request would keep a number the grid never used.
        expect(seen[0].width).toBe(240);
        expect((seen[0].columnWidths as Record<string, number>).name).toBe(240);
    });

    it('a resize past the column\'s limit reports the width it actually took', async () => {
        const el = document.createElement('pdx-data-grid') as Grid;
        el.columns = [{ field: 'name', header: 'Name', maxWidth: 200 }, { field: 'city', header: 'City' }];
        el.data = PEOPLE;
        document.body.appendChild(el);
        await tick(40);
        await tick(20);
        const seen = record(el, 'pdx-column-resize');

        el.grid.resize('name', 9999);

        expect(seen[0].width, 'it reported what was asked for, not what happened').toBe(200);
    });

    it('and the move is ON SCREEN: the header repaints', async () => {
        // The event is half of it. A repaint left to each call site gets forgotten — a header drop
        // that reorders the MODEL and leaves the screen as it was. The repaint is wired where the
        // change is reported, so it cannot be forgotten by the next call site.
        const el = await mountGrid();
        const fields = () => [...el.querySelectorAll('.pdx-dg-th[data-field]')].map((th) => th.getAttribute('data-field'));
        expect(fields()).toEqual(['name', 'city', 'note']);

        el.grid.reorder('note', 'name');
        await tick(40);

        expect(fields(), 'the model moved and the header did not').toEqual(['note', 'name', 'city']);
    });

    it('a move that changes nothing says nothing', async () => {
        const el = await mountGrid();
        const seen = record(el, 'pdx-column-reorder');

        el.grid.reorder('name', 'name');        // onto itself
        el.grid.reorder('nope', 'name');        // a column that does not exist

        expect(seen, 'the grid announced a rearrangement it did not make').toHaveLength(0);
    });

    it('RESTORING a state says nothing: it is not something a reader did', async () => {
        // The control, and the reason the events are on the three actions rather than on the
        // signals: `loadState` is how an application PUTS a saved view back, and a grid that
        // announced it would have every app mark the view it just applied as changed.
        const el = await mountGrid();
        const order = record(el, 'pdx-column-reorder');
        const visibility = record(el, 'pdx-column-visibility-change');
        const width = record(el, 'pdx-column-resize');

        el.grid.loadState({
            columnOrder: ['city', 'name', 'note'],
            columnVisibility: { note: false },
            columnWidths: { name: 300 },
        });

        expect([order.length, visibility.length, width.length],
            'restoring a view announced itself as a reader rearranging the columns').toEqual([0, 0, 0]);
        // And it did happen — otherwise this control passes on a `loadState` that does nothing.
        expect(el.grid.saveState().columnOrder).toEqual(['city', 'name', 'note']);
    });
});
