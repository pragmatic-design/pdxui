// A `cell:` the grid does not recognise says so, once per column.
//
// `cell` takes a CellSpec — what badge(), status(), link(), currency(), dateCell(), booleanIcon() and
// actions() return. A function passed there (`cell: (row) => 'Sì'`) is truthy, has no `kind`, matches
// no case of renderCellNode's switch, and falls through to the raw value: without the warning, an
// author gets `false` where they wanted "Sì" and has to read core's .d.ts to find out why.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { cleanup, tick } from './helpers';
import { badge } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

const ROWS = [
    { id: 1, name: 'Ada', active: false, status: 'Active' },
    { id: 2, name: 'Grace', active: true, status: 'Idle' },
    { id: 3, name: 'Katherine', active: false, status: 'Active' },
];

async function mountGrid(columns: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-data-grid') as HTMLElement & { columns: unknown; data: unknown };
    el.columns = columns;
    el.data = ROWS.map(r => ({ ...r }));
    document.body.appendChild(el);
    await tick(30);
    return el;
}

let warn: Mock<typeof console.warn>;
const gridWarnings = (): string[] =>
    warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('[pdx-data-grid]'));

describe('a data-grid column whose cell: is not a cell builder', () => {
    beforeEach(() => { cleanup(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warn.mockRestore(); });

    it('warns once for the column — not once per row — and still renders what it rendered before', async () => {
        // "Before" is what the same column shows with no cell: at all — the column type's default.
        const rowTexts = (el: HTMLElement): string[] => [...el.querySelectorAll('.pdx-dg-row')].map(r => r.textContent ?? '');
        const plain = rowTexts(await mountGrid([{ field: 'name', header: 'Name' }, { field: 'active', header: 'Active' }]));
        cleanup();

        const el = await mountGrid([
            { field: 'name', header: 'Name' },
            { field: 'active', header: 'Active', cell: (row: { active: boolean }) => (row.active ? 'Sì' : 'No') },
        ]);
        expect(plain.length, 'the grid rendered no rows: the case measures nothing').toBe(3);
        expect(rowTexts(el), 'the fall-through changed what the column shows').toEqual(plain);

        const found = gridWarnings().filter(m => m.includes('"active"'));
        expect(found, 'a function passed as cell: was ignored in silence').toHaveLength(1);
        expect(found[0]).toMatch(/a function/);
        expect(found[0], 'the warning does not name the builders').toMatch(/badge.*status.*link.*currency.*dateCell.*booleanIcon.*actions/s);
        expect(found[0], 'the warning does not say how to relabel a value').toContain('format');
    });

    it('names the kind it got, when a spec carries one the grid does not know', async () => {
        await mountGrid([{ field: 'name', header: 'Name', cell: { kind: 'sparkline' } }]);
        const found = gridWarnings().filter(m => m.includes('"name"'));
        expect(found).toHaveLength(1);
        expect(found[0]).toContain("'sparkline'");
    });

    it('control: a badge() column logs nothing', async () => {
        const el = await mountGrid([{ field: 'status', header: 'Status', cell: badge({ tones: { Active: 'success' } }) }]);
        expect(el.querySelectorAll('.pdx-dg-badge').length, 'the badge column rendered no badge').toBe(3);
        expect(gridWarnings()).toEqual([]);
    });
});
