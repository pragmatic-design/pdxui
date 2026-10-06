// A grid bound to a source that keeps a selection hands its selection over.
//
// The grid keeps `gc.selectedIds` and publishes it through `pdx-selection-change` and its flat host
// API. The `DataSource` has a separate, richer selection — cross-page `selectAll()` over the current
// filter, `selectedItems`, optional persistence. Unfed, a ticked row makes the event say
// `{count: 1}` while `selectedCount()` is still `0`, so anything bound to the source reads zero while
// a row is visibly ticked.
//
// Option A: the grid feeds the source WHEN the source has selection enabled. Two properties, and the
// second is what keeps A from becoming C:
//
//   · opted in  → the source mirrors what the user sees;
//   · not opted in → nothing changes at all. A source that never asked for selection state must not
//     acquire it, or `options.selection` stops meaning anything.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { createDataSource } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

interface Row extends Record<string, unknown> { id: number; name: string; city: string }

const ROWS: Row[] = [
    { id: 1, name: 'Ada', city: 'Torino' },
    { id: 2, name: 'Grace', city: 'Milano' },
    { id: 3, name: 'Katherine', city: 'Torino' },
];
const COLUMNS = [{ field: 'name', header: 'Name' }, { field: 'city', header: 'City' }];

/** Mount a grid over a source, and hand back both. */
async function mountGrid(withSelection: boolean) {
    const source = createDataSource<Row>({
        data: ROWS.map(r => ({ ...r })),
        pageSize: 0,
        ...(withSelection ? { selection: { mode: 'multiple' as const } } : {}),
    });
    const el = document.createElement('pdx-data-grid') as HTMLElement & {
        columns: unknown; source: unknown; selection: string;
        getSelectedIds(): unknown[]; clearSelection(): void;
    };
    el.columns = COLUMNS;
    el.source = source;
    el.selection = 'multiple';
    document.body.appendChild(el);
    await tick(30);
    return { el, source };
}

/** Click the checkbox of the nth data row. */
function tickRow(el: HTMLElement, n: number): void {
    const boxes = el.querySelectorAll('.pdx-dg-row .pdx-dg-checkbox input');
    (boxes[n] as HTMLInputElement | undefined)?.click();
}

describe('a grid over a source that keeps a selection', () => {
    beforeEach(cleanup);

    it('renders rows with checkboxes at all', async () => {
        // Without this the assertions below could all be passing over an empty grid.
        const { el } = await mountGrid(true);
        expect(el.querySelectorAll('.pdx-dg-row .pdx-dg-checkbox input').length).toBe(3);
    });

    it('puts what the user ticked into the source', async () => {
        const { el, source } = await mountGrid(true);
        tickRow(el, 0);
        await tick(20);
        expect(el.getSelectedIds(), 'the grid knows').toEqual([1]);
        expect(source.selectedCount(), 'and so does the source').toBe(1);
        expect([...source.selected()]).toEqual([1]);
        expect(source.selectedItems().map(r => r.name), 'resolved to items').toEqual(['Ada']);
    });

    it('keeps the two in step across several ticks', async () => {
        const { el, source } = await mountGrid(true);
        tickRow(el, 0);
        tickRow(el, 2);
        await tick(20);
        expect([...source.selected()].sort()).toEqual([1, 3]);

        tickRow(el, 0);   // untick
        await tick(20);
        expect([...source.selected()], 'unticking removes it from the source too').toEqual([3]);
    });

    it('empties the source when the grid clears', async () => {
        const { el, source } = await mountGrid(true);
        tickRow(el, 0);
        await tick(20);
        el.clearSelection();
        await tick(20);
        expect(source.selectedCount()).toBe(0);
    });

    it('leaves a source that never opted in completely alone', async () => {
        // The line between option A and option C. Without this assertion, "always feed the source"
        // would pass every test above.
        const { el, source } = await mountGrid(false);
        tickRow(el, 0);
        await tick(20);
        expect(el.getSelectedIds(), 'the grid still works on its own').toEqual([1]);
        expect(source.selectedCount(), 'and the source is untouched').toBe(0);
        expect(source.selected().size).toBe(0);
    });
});
