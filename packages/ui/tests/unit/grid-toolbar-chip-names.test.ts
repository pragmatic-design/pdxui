// The toolbar's chips say what they sort and what they filter, in the reader's words.
//
// A list sorted by `id`, where the `id` column is the row's actions whose header is '': `'' ?? field`
// is '', and the sort chip would read «↑ ×». A chip that names nothing is a chip nobody can read.
//
// And a filter chip must not write the stored code — `Status equals "closed"` — where the column's
// `format` says «Closed». As for the filter builder's chip and a badge: a column's label for its
// values is `format`, and the chip asks it.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, unknown>;
const ROWS = [
    { id: 1, name: 'Ada', state: 'open' },
    { id: 2, name: 'Grace', state: 'closed' },
];
const LABELS: Record<string, string> = { open: 'Aperto', closed: 'Chiuso' };

async function mountGrid(columns: unknown[]): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = columns;
    el.data = ROWS.map(r => ({ ...r }));
    el.showToolbar = true;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}
const source = (el: Grid) => (el.grid as { source: { setSort(s: unknown[]): void; setFilter(f: unknown[]): void } }).source;
const chips = (el: Grid, kind: 'sort' | 'filter') =>
    [...el.querySelectorAll(`.pdx-dg-toolbar-chip-${kind}`)].map(c => (c.textContent ?? '').replace('✕', '').trim());

describe('the toolbar\'s chips name what they act on', () => {
    beforeEach(cleanup);

    it('a sort on a column with no header still names what it sorts', async () => {
        const el = await mountGrid([
            { field: 'name', header: 'Name' },
            { field: 'id', header: '' },
        ]);
        source(el).setSort([{ field: 'id', dir: 'asc' }]);
        await tick(20);
        expect(chips(el, 'sort'), 'the chip names nothing: «↑ ×»').toEqual(['id']);
    });

    it('control — a sort on a named column shows its header', async () => {
        const el = await mountGrid([{ field: 'name', header: 'Name' }]);
        source(el).setSort([{ field: 'name', dir: 'asc' }]);
        await tick(20);
        expect(chips(el, 'sort')).toEqual(['Name']);
    });

    it('a filter chip shows the column\'s label for the value, not the stored code', async () => {
        const el = await mountGrid([
            { field: 'name', header: 'Name' },
            { field: 'state', header: 'State', format: (v: unknown) => LABELS[String(v)] },
        ]);
        source(el).setFilter([{ field: 'state', operator: 'eq', value: 'closed' }]);
        await tick(20);
        const [chip] = chips(el, 'filter');
        expect(chip, 'the chip shows the stored code').toContain('Chiuso');
        expect(chip).not.toContain('closed');
    });

    it('control — a column with no format shows the value as it is', async () => {
        const el = await mountGrid([{ field: 'name', header: 'Name' }]);
        source(el).setFilter([{ field: 'name', operator: 'eq', value: 'Ada' }]);
        await tick(20);
        expect(chips(el, 'filter')[0]).toContain('"Ada"');
    });
});

describe('a cell\'s text can be read whole', () => {
    beforeEach(cleanup);

    it('text sits in its own element that can be clipped with an ellipsis — not straight in the flex cell', async () => {
        const el = await mountGrid([{ field: 'name', header: 'Name' }]);
        const cell = el.querySelector('.pdx-dg-body .pdx-dg-td') as HTMLElement;
        const text = cell.querySelector('.pdx-dg-td-text');
        expect(text, 'the text is a bare node in a flex cell, where text-overflow cannot apply').not.toBeNull();
        expect(text!.textContent).toBe('Ada');
    });
});
