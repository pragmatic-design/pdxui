// pdx-data-grid's maxHeight caps every grid, and rowHeight says when it does nothing.
//
// The catalogue describes maxHeight as "caps the grid height; the body scrolls beyond it" and
// rowHeight as "fixed row height in px". Read only by the virtualScroll branch, `:max-height="620"`
// would leave a 20-row grid 1007 px tall, and `:row-height="44"` rows at 43.7 px, with no message.
//
// maxHeight caps the scroll element of any grid; its default is 0 (no cap), since a default cap
// applied to every existing grid would clip them all. rowHeight stays a virtual-scroll setting, since
// a content grid should not clip its rows, and a grid given one without virtualScroll says so.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

const ROWS = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
const COLUMNS = [{ field: 'id', header: 'Id' }, { field: 'name', header: 'Name' }];

type Grid = HTMLElement & { columns: unknown; data: unknown; maxHeight: number; rowHeight: number; virtualScroll: boolean };

async function mountGrid(props: Partial<Pick<Grid, 'maxHeight' | 'rowHeight' | 'virtualScroll'>> = {}): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = COLUMNS;
    el.data = ROWS.map(r => ({ ...r }));
    Object.assign(el, props);
    document.body.appendChild(el);
    await tick(30);
    return el;
}

const scrollOf = (el: HTMLElement): HTMLElement => el.querySelector('.pdx-dg-scroll') as HTMLElement;

let warn: Mock<typeof console.warn>;
const gridWarnings = (): string[] =>
    warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('[pdx-data-grid]'));

describe('pdx-data-grid maxHeight without virtualScroll', () => {
    beforeEach(() => { cleanup(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warn.mockRestore(); });

    it('caps the scroll element of a plain grid', async () => {
        const el = await mountGrid({ maxHeight: 200 });
        expect(el.querySelectorAll('.pdx-dg-row').length, 'the grid rendered no rows: the case measures nothing').toBe(20);
        const scroll = scrollOf(el);
        expect(scroll.style.maxHeight, 'maxHeight was set and the scroll element is not capped').toBe('200px');
        // The body scrolls under it: .pdx-dg-scroll is overflow-y: auto in data-grid.css, measured in
        // Chromium by the certify spec; the header is inside the same element and sticky by default.
        expect(scroll.contains(el.querySelector('.pdx-dg-header'))).toBe(true);
    });

    it('follows a change of maxHeight', async () => {
        const el = await mountGrid({ maxHeight: 200 });
        el.maxHeight = 320;
        await tick(30);
        expect(scrollOf(el).style.maxHeight).toBe('320px');
        el.maxHeight = 0;
        await tick(30);
        expect(scrollOf(el).style.maxHeight, '0 means no cap').toBe('');
    });

    it('leaves a grid with no maxHeight uncapped — the control', async () => {
        const el = await mountGrid();
        expect(el.maxHeight, 'the default must not cap every existing grid').toBe(0);
        expect(scrollOf(el).style.maxHeight).toBe('');
    });

    it('keeps the virtual grid capping its body, with its own 400 fallback', async () => {
        const el = await mountGrid({ virtualScroll: true });
        const body = el.querySelector('.pdx-dg-body') as HTMLElement;
        expect(body.style.maxHeight).toBe('400px');
        expect(scrollOf(el).style.maxHeight, 'the virtual branch caps the body, not the scroll element').toBe('');
    });
});

describe('pdx-data-grid rowHeight without virtualScroll', () => {
    beforeEach(() => { cleanup(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warn.mockRestore(); });

    it('says once that it does nothing there', async () => {
        const el = await mountGrid({ rowHeight: 44 });
        el.maxHeight = 300; // a rebuild: the warning must not repeat
        await tick(30);
        const found = gridWarnings().filter(m => m.includes('rowHeight'));
        expect(found, 'rowHeight was set on a plain grid and ignored in silence').toHaveLength(1);
        expect(found[0]).toContain('virtualScroll');
    });

    it('says nothing when virtualScroll is on, or when rowHeight is not set — the control', async () => {
        await mountGrid({ rowHeight: 44, virtualScroll: true });
        cleanup();
        await mountGrid();
        expect(gridWarnings().filter(m => m.includes('rowHeight'))).toEqual([]);
    });
});
