// `row-clickable`: the grid says its rows open something.
//
// The grid emits `pdx-row-click`; without the prop a row does not say it can be clicked, and a page
// has to reach into its internal class for the cursor (`.page .pdx-dg-row { cursor: pointer }`). The
// prop puts the grid in a mode the design system's CSS keys on; the cursor itself is measured in
// the browser by the data-grid manifest (Dim 1), since happy-dom computes no stylesheet.
import { describe, it, expect, beforeEach } from 'vitest';
import { createDataSource } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, any>;

const COLS = [{ field: 'name', header: 'Name' }];
const DATA = [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }];

beforeEach(() => cleanup());

async function mountGrid(setUp: (el: Grid) => void): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = COLS;
    el.source = createDataSource({ data: DATA, pageSize: 10 });
    setUp(el);
    document.body.appendChild(el);
    await el.whenReady();
    await tick(40);
    return el;
}

/** The class the CSS keys on, read from where a row sits: its grid container. */
const rowsAreClickable = (el: Grid) => {
    const row = el.querySelector('.pdx-dg-row');
    expect(row, 'the grid drew no row').not.toBeNull();
    return !!row!.closest('.pdx-dg-rows-clickable');
};

describe('pdx-data-grid rowClickable', () => {
    it('with the prop, every row sits in the mode the CSS gives a pointer', async () => {
        const el = await mountGrid((g) => { g.rowClickable = true; });
        expect(rowsAreClickable(el), 'a row that opens something does not say so').toBe(true);
    });

    it('the attribute works too, as a page writes it: row-clickable', async () => {
        const el = await mountGrid((g) => { g.setAttribute('row-clickable', ''); });
        expect(rowsAreClickable(el)).toBe(true);
    });

    it('control — without it, a row does not claim to be clickable', async () => {
        const el = await mountGrid(() => {});
        expect(rowsAreClickable(el)).toBe(false);
    });
});
