// The two pieces a grid needs to hand its selection to the source it is bound to.
//
// `DataSource` has a full selection API — cross-page `selectAll()` over the current filter,
// `selectedItems`, optional persistence — and a `pdx-data-grid` bound to that source that fills
// NONE of it leaves the grid's event saying `{count: 1}` while `selectedCount()` stays `0`: anything
// bound to the source reads zero while a row is visibly ticked.
//
// The grid feeds the source WHEN the source has selection enabled. Nothing changes for anyone who
// has not opted in. That needs two things from the source, and this is where they are asserted:
//
//   · `selectionEnabled` — the grid cannot infer it. `selected` is an empty Set either way, and
//     `_selectionEnabled` is private, so without this the grid would have to guess or write blindly
//     into a source that never asked for selection state.
//   · `setSelected(ids)` — replacing the whole selection in one go. Doing it through `select(id)` N
//     times means N notifications and N persistence writes for one user gesture, and passes through
//     `single` mode's replace semantics, which would leave one row selected out of five.

import { describe, it, expect } from 'vitest';
import { createDataSource } from '../src/data/data-source';
// Imported at the top, not awaited inside a test: the first dynamic import pays the module
// transform inside whichever test happens to run first, and its timeout absorbs the cost.
// (suite-hygiene.test.ts asserts this shape.)
import { effect } from '../src/reactivity/signal';

interface Row extends Record<string, unknown> { id: number; name: string }

const ROWS: Row[] = [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
    { id: 3, name: 'Katherine' },
];

describe('a source says whether its selection is enabled', () => {
    it('is false when nobody asked for one', () => {
        const ds = createDataSource<Row>({ data: ROWS });
        expect(ds.selectionEnabled).toBe(false);
    });

    it('is true when it was opted into', () => {
        const ds = createDataSource<Row>({ data: ROWS, selection: { mode: 'multiple' } });
        expect(ds.selectionEnabled).toBe(true);
    });

    it('is the only way to tell — `selected` looks identical either way', () => {
        // This is why the flag has to exist rather than being inferred: both sources answer an empty
        // Set, and writing into the one that never asked would give it state it does not want.
        const off = createDataSource<Row>({ data: ROWS });
        const on = createDataSource<Row>({ data: ROWS, selection: { mode: 'multiple' } });
        expect(off.selected().size).toBe(0);
        expect(on.selected().size).toBe(0);
    });
});

describe('setSelected replaces the whole selection at once', () => {
    it('sets what it is given', async () => {
        const ds = createDataSource<Row>({ data: ROWS, selection: { mode: 'multiple' } });
        await ds.refresh();
        ds.setSelected([1, 3]);
        expect([...ds.selected()].sort()).toEqual([1, 3]);
        expect(ds.selectedCount()).toBe(2);
        expect(ds.selectedItems().map(r => r.name).sort()).toEqual(['Ada', 'Katherine']);
    });

    it('replaces rather than adds', () => {
        const ds = createDataSource<Row>({ data: ROWS, selection: { mode: 'multiple' } });
        ds.setSelected([1, 2]);
        ds.setSelected([3]);
        expect([...ds.selected()]).toEqual([3]);
    });

    it('clears with an empty list', () => {
        const ds = createDataSource<Row>({ data: ROWS, selection: { mode: 'multiple' } });
        ds.setSelected([1, 2]);
        ds.setSelected([]);
        expect(ds.selectedCount()).toBe(0);
    });

    it('keeps one in single mode instead of silently holding several', () => {
        // A grid in `single` mode never sends more than one, but a source in single mode must not end
        // up with a selection its own API could never produce.
        const ds = createDataSource<Row>({ data: ROWS, selection: { mode: 'single' } });
        ds.setSelected([1, 2, 3]);
        expect(ds.selectedCount(), 'single means single').toBe(1);
    });

    it('does nothing on a source without selection', () => {
        // Not an error: the grid calls this on whatever source it is given, and a source that never
        // opted in must stay exactly as it was.
        const ds = createDataSource<Row>({ data: ROWS });
        expect(() => ds.setSelected([1, 2])).not.toThrow();
        expect(ds.selectedCount()).toBe(0);
    });

    it('notifies once for the whole change, not once per id', async () => {
        // Selecting 200 rows with a shift-click is one gesture. Through `select(id)` it would be 200
        // notifications and, with persistKey, 200 localStorage writes.
        const ds = createDataSource<Row>({ data: ROWS, selection: { mode: 'multiple' } });
        await ds.refresh();
        let notifications = 0;
        const stop = effect(() => {
            ds.selected();
            notifications++;
        });
        const before = notifications;
        ds.setSelected([1, 2, 3]);
        await new Promise(r => setTimeout(r, 0));
        expect(notifications - before, 'one change, one notification').toBe(1);
        stop();
    });
});
