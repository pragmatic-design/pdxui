// A virtual grid keeps the rows that stay in view when it scrolls, and draws once per frame (#902).
//
// A change of the visible range emptied the whole window and built every row again, the rows still
// in view included, with their cells and their bindings; and every scroll event asked for a frame of
// its own, so a frame that received ten scroll events rendered ten times.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

afterEach(() => { vi.restoreAllMocks(); cleanup(); });

const ROW = 40;
const ROWS = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
const COLUMNS = [{ field: 'id', header: 'Id' }, { field: 'name', header: 'Name' }];

type Grid = HTMLElement & { columns: unknown; data: unknown; maxHeight: number; rowHeight: number; virtualScroll: boolean };

async function mountGrid(): Promise<{ grid: Grid; body: HTMLElement }> {
    const grid = document.createElement('pdx-data-grid') as Grid;
    grid.columns = COLUMNS;
    grid.data = ROWS.map(r => ({ ...r }));
    Object.assign(grid, { virtualScroll: true, rowHeight: ROW, maxHeight: 400 });
    document.body.appendChild(grid);
    await tick(30);
    return { grid, body: grid.querySelector('.pdx-dg-body') as HTMLElement };
}

const rowAt = (grid: HTMLElement, index: number): Element | null => grid.querySelector(`.pdx-dg-row[data-row-index="${index}"]`);
const indices = (grid: HTMLElement): number[] =>
    [...grid.querySelectorAll('.pdx-dg-row')].map(r => Number(r.getAttribute('data-row-index')));

async function scrollTo(body: HTMLElement, top: number): Promise<void> {
    body.scrollTop = top;
    body.dispatchEvent(new Event('scroll'));
    await tick(30);
}

describe('virtual grid — the window it keeps', () => {
    it('keeps the rows that stay in view, and builds only the ones that enter', async () => {
        const { grid, body } = await mountGrid();
        const kept = rowAt(grid, 8);
        expect(kept, 'row 8 is in the first window').not.toBeNull();

        await scrollTo(body, 6 * ROW);

        expect(rowAt(grid, 8), 'row 8 was built again').toBe(kept);
        const now = indices(grid);
        expect(now[0]).toBe(1);
        expect(now).toEqual(Array.from({ length: now.length }, (_, i) => i + 1));
        expect(now.at(-1)!).toBeGreaterThan(15);
    });

    it('builds a window it jumps to, rows in order, nothing left from the old one', async () => {
        const { grid, body } = await mountGrid();
        await scrollTo(body, 500 * ROW);
        const now = indices(grid);
        expect(now[0]).toBe(495);
        expect(now).toEqual(Array.from({ length: now.length }, (_, i) => i + 495));
        expect(rowAt(grid, 0)).toBeNull();

        await scrollTo(body, 497 * ROW);
        expect(indices(grid)).toEqual(Array.from({ length: indices(grid).length }, (_, i) => i + 492));
    });

    it('asks for one frame for the scroll events of one frame', async () => {
        const { body } = await mountGrid();
        const raf = vi.spyOn(window, 'requestAnimationFrame');
        for (let i = 1; i <= 10; i++) {
            body.scrollTop = i * ROW;
            body.dispatchEvent(new Event('scroll'));
        }
        expect(raf.mock.calls.length, 'frames requested by 10 scroll events').toBe(1);
        await tick(30);
    });
});
