// pdx-data-grid loads pdx-spinner only when its loading overlay shows (#969).
//
// The overlay is built with the grid, its spinner element in it; the module, and the stylesheet it
// draws from since #821, arrive the first time the grid loads. Imported statically they were in the
// first wave of every page with a grid (#963).
//
// This file is its own module graph, so whether `pdx-spinner` is registered is this file's to say: it
// imports the grid and what the grid's other tests import with it.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { createDataSource, type DataResponse } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, unknown>;
const COLS = [{ field: 'name', header: 'Name' }];

async function mountGrid(props: Record<string, unknown>): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    for (const [k, v] of Object.entries(props)) el[k] = v;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

describe('pdx-data-grid and pdx-spinner', () => {
    beforeEach(cleanup);

    it('a grid with its rows never loads pdx-spinner', async () => {
        const el = await mountGrid({ columns: COLS, data: [{ id: 1, name: 'Ada' }] });
        expect(el.querySelector('.pdx-dg-body [role="row"]'), 'the grid drew no row: nothing was measured').not.toBeNull();
        await tick(50);
        expect(customElements.get('pdx-spinner'), 'pdx-spinner was loaded for a grid that is not loading').toBeUndefined();
    });

    it('control — a grid whose source loads shows the spinner, and loads it', async () => {
        type Row = { id: number; name: string };
        let answer: (rows: DataResponse<Row>) => void = () => {};
        const source = createDataSource<Row>({
            transport: { read: () => new Promise<DataResponse<Row>>((resolve) => { answer = resolve; }) },
            pageSize: 10,
        });
        const el = await mountGrid({ columns: COLS, source });
        const overlay = el.querySelector<HTMLElement>('.pdx-dg-loading');
        expect(overlay?.style.display, 'the loading overlay is not shown while the source loads').toBe('');
        // The load it asserts on, not a time: a cold transform can take longer than any fixed wait.
        await customElements.whenDefined('pdx-spinner');
        await tick();
        expect(overlay?.querySelector('pdx-spinner [role="status"]'), 'the spinner in the overlay did not upgrade').not.toBeNull();
        answer({ data: [{ id: 1, name: 'Ada' }], total: 1 });
    });
});
