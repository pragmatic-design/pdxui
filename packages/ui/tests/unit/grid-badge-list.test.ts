// A badge cell over a LIST draws one badge per value.
//
// Categories are an array on a record — `['hardware', 'network']`. A stringified value would be one
// grey badge reading «hardware,network», its tone looked up for the joined string and missed. Each
// value is its own badge, toned by ITS code and named by the column's `format` for it.
import { describe, it, expect, beforeEach } from 'vitest';
import { badge } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, any>;

beforeEach(() => cleanup());

async function mountGrid(data: Record<string, unknown>[]): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = [
        { field: 'name', header: 'Name' },
        { field: 'categories', header: 'Categories',
          format: (v: unknown) => ({ hardware: 'Hardware', network: 'Network' } as Record<string, string>)[String(v)] ?? String(v),
          cell: badge({ tones: { hardware: 'primary', network: 'info' } }) },
    ];
    el.data = data;
    document.body.appendChild(el);
    await el.whenReady();
    await tick(20);
    return el;
}

const cell = (el: Grid) => el.querySelector('[role="gridcell"][data-field="categories"]')!;

describe('pdx-data-grid badge over a list', () => {
    it('draws one badge per value, each toned and labelled by its own code', async () => {
        const el = await mountGrid([{ id: 1, name: 'A', categories: ['hardware', 'network'] }]);
        const badges = [...cell(el).querySelectorAll('.pdx-dg-badge')];
        expect(badges.map((b) => b.textContent)).toEqual(['Hardware', 'Network']);
        expect(badges[0].classList.contains('pdx-dg-badge-primary')).toBe(true);
        expect(badges[1].classList.contains('pdx-dg-badge-info')).toBe(true);
    });

    it('an empty list draws no badge, not an empty grey one', async () => {
        const el = await mountGrid([{ id: 1, name: 'A', categories: [] }]);
        expect(cell(el).querySelectorAll('.pdx-dg-badge')).toHaveLength(0);
    });

    it('control — a single value still draws one badge, as before', async () => {
        const el = await mountGrid([{ id: 1, name: 'A', categories: 'network' }]);
        const badges = [...cell(el).querySelectorAll('.pdx-dg-badge')];
        expect(badges.map((b) => b.textContent)).toEqual(['Network']);
        expect(badges[0].classList.contains('pdx-dg-badge-info')).toBe(true);
    });
});
