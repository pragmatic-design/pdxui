// The grid's Export is a menu: CSV or Excel, the same rows either way.
//
// Both formats write the same rows — the rows the filter selects, or the selection — so the menu is
// a choice of FILE, never of data.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, any>;

const COLS = [{ field: 'name', header: 'Name' }, { field: 'hours', header: 'Hours' }];
const DATA = [{ id: 1, name: 'Ada', hours: 7.5 }, { id: 2, name: 'Grace', hours: 3 }];

let saved: { name: string; blob: Blob }[] = [];
let lastBlob: Blob | null = null;

beforeEach(() => {
    cleanup();
    saved = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => { lastBlob = b as Blob; return 'blob:test'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        saved.push({ name: this.download, blob: lastBlob! });
    });
});
afterEach(() => vi.restoreAllMocks());

async function mountGrid(): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.setAttribute('show-toolbar', '');
    el.columns = COLS;
    el.data = DATA;
    document.body.appendChild(el);
    await el.whenReady();
    await tick(20);
    return el;
}

function openExport(el: Grid): HTMLElement[] {
    (el.querySelector('[data-grid-export]') as HTMLElement).click();
    return [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')];
}

describe('the grid toolbar export', () => {
    it('opens a menu that offers CSV and Excel', async () => {
        const el = await mountGrid();
        const button = el.querySelector('[data-grid-export]') as HTMLElement;
        expect(button.getAttribute('aria-haspopup'), 'the button does not say it opens a menu').toBe('menu');
        const items = openExport(el);
        expect(items.map((i) => i.textContent?.trim())).toEqual(['CSV (.csv)', 'Excel (.xlsx)']);
        expect(saved, 'opening the menu exported something').toEqual([]);
    });

    it('Excel saves a .xlsx of the xlsx type', async () => {
        const el = await mountGrid();
        openExport(el)[1].click();
        await tick(20);
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toMatch(/^export-\d{4}-\d{2}-\d{2}\.xlsx$/);
        expect(saved[0].blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('control — CSV still saves the CSV it always did', async () => {
        const el = await mountGrid();
        openExport(el)[0].click();
        await tick(20);
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toMatch(/\.csv$/);
        expect(saved[0].blob.type).toBe('text/csv;charset=utf-8');
        expect(await saved[0].blob.text()).toContain('Ada');
    });
});
