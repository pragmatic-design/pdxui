// The grid offers a rows-per-page selector when it is given sizes.
//
// Its pager can draw one — `pdx-pagination` has `show-page-size` and `page-sizes` — and the grid's
// `pageSizes` prop is what passes them through: without it, no grid could offer one.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDataSource } from '@pdxui/core';
import { cleanup, tick, whenUpgraded } from './helpers';
import '../../src/data-grid/pdx-data-grid';

// The pager imports pdx-select lazily (#407). Held back here, as a contended gate holds it, so a test
// that reads the select before it is upgraded fails every time instead of once in a while (#692).
vi.mock('../../src/select/pdx-select', async (importOriginal) => {
    await new Promise((r) => setTimeout(r, 300));
    return importOriginal();
});

type Grid = HTMLElement & Record<string, any>;

const COLS = [{ field: 'name', header: 'Name' }];
const DATA = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

beforeEach(() => cleanup());

async function mountGrid(pageSizes?: number[]): Promise<{ el: Grid; source: ReturnType<typeof createDataSource> }> {
    const source = createDataSource({ data: DATA, pageSize: 10 });
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = COLS;
    el.source = source;
    if (pageSizes) el.pageSizes = pageSizes;
    document.body.appendChild(el);
    await el.whenReady();
    await tick(40);
    // The rows-per-page control is the pager's lazily imported pdx-select: read once it is upgraded.
    await whenUpgraded(sizeSelect(el));
    return { el, source };
}

type SizeSelect = HTMLElement & { value: string | null; options: { value: string }[] };
/** The pager's rows-per-page control, a pdx-select. */
const sizeSelect = (el: Grid) => el.querySelector<SizeSelect>('.pdx-dg-footer pdx-select.pdx-pagination-size');

describe('pdx-data-grid pageSizes', () => {
    it('with sizes, the footer holds a rows-per-page control with those options', async () => {
        const { el } = await mountGrid([10, 20, 50]);
        const select = sizeSelect(el);
        expect(select, 'no rows-per-page control in the footer').not.toBeNull();
        expect(select!.options.map(o => o.value)).toEqual(['10', '20', '50']);
        expect(select!.value, 'the control does not show the source\'s size').toBe('10');
        expect(select!.querySelector('[role="combobox"]')!.getAttribute('aria-label')).toBe('Rows per page');
    });

    it('picking 20 sets the source\'s page size to 20', async () => {
        const { el, source } = await mountGrid([10, 20, 50]);
        const select = sizeSelect(el)!;
        (select.querySelector('.pdx-select-trigger') as HTMLElement).click();
        await tick(20);
        [...select.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.trim() === '20')!.click();
        await tick(40);
        expect(source.pageSize()).toBe(20);
        expect(source.page()).toBe(1);
    });

    it('a size applied from a saved state shows in the control', async () => {
        const { el } = await mountGrid([10, 20, 50]);
        el.applyState({ pageSize: 50 });
        await tick(60);
        expect(sizeSelect(el)!.value).toBe('50');
    });

    it('control — without sizes, the footer has no such control', async () => {
        const { el } = await mountGrid();
        expect(el.querySelector('.pdx-dg-footer pdx-pagination'), 'the footer lost its pager').not.toBeNull();
        expect(sizeSelect(el)).toBeNull();
    });
});
