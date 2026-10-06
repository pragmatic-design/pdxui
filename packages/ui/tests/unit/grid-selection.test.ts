// Grid selection UI: updateSelectionUI() uses the instance's own header/body and matches each
// row by its data-row-id. Not:
//   1. document.querySelector('pdx-data-grid ...') → the FIRST grid on the page, nor
//   2. rowEls[i] ↔ rows[i] by DOM index — wrong under virtual scroll (rows start at startIdx).

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup } from './helpers';
import { updateSelectionUI } from '../../src/data-grid/grid-selection';
import type { GridContext } from '../../src/data-grid/grid-context';

function buildGrid(rowIds: (string | number)[]): { grid: HTMLElement; header: HTMLElement; body: HTMLElement } {
    const grid = document.createElement('pdx-data-grid');
    const header = document.createElement('div');
    header.className = 'pdx-dg-header';
    const hcb = document.createElement('div');
    hcb.className = 'pdx-dg-checkbox';
    hcb.innerHTML = '<input type="checkbox" />';
    header.appendChild(hcb);

    const body = document.createElement('div');
    body.className = 'pdx-dg-body';
    for (const id of rowIds) {
        const row = document.createElement('div');
        row.className = 'pdx-dg-row';
        row.setAttribute('data-row-id', String(id));
        const cbWrap = document.createElement('div');
        cbWrap.className = 'pdx-dg-checkbox';
        cbWrap.innerHTML = '<input type="checkbox" />';
        row.appendChild(cbWrap);
        body.appendChild(row);
    }
    grid.appendChild(header);
    grid.appendChild(body);
    document.body.appendChild(grid);
    return { grid, header, body };
}

function fakeGc(opts: {
    rows: Record<string, unknown>[];
    selected: unknown[];
    header: HTMLElement;
    body: HTMLElement;
}): GridContext {
    return {
        grid: { rows: { peek: () => opts.rows } } as unknown as GridContext['grid'],
        getIdField: () => 'id',
        getSelectionMode: () => 'multiple',
        selectedIds: new Set(opts.selected),
        getHeaderEl: () => opts.header,
        getBodyEl: () => opts.body,
        emit: () => {},
    } as unknown as GridContext;
}

function rowById(body: HTMLElement, id: string): HTMLElement {
    return body.querySelector(`.pdx-dg-row[data-row-id="${id}"]`) as HTMLElement;
}

describe('updateSelectionUI targets the right grid + right rows', () => {
    beforeEach(cleanup);

    it('paints the correct instance and matches rows by data-row-id (not DOM index)', () => {
        // Grid A is FIRST in the document — the old fallback would paint this one.
        const a = buildGrid([1, 2]);
        // Grid B is virtual-scrolled: only rows 11,12 rendered, but the full dataset is 10,11,12.
        const b = buildGrid([11, 12]);

        const gc = fakeGc({
            rows: [{ id: 10 }, { id: 11 }, { id: 12 }],
            selected: [12],
            header: b.header,
            body: b.body,
        });

        updateSelectionUI(gc);

        // Grid B: row 12 selected, row 11 not.
        expect(rowById(b.body, '12').classList.contains('pdx-dg-row-selected')).toBe(true);
        expect((rowById(b.body, '12').querySelector('input') as HTMLInputElement).checked).toBe(true);
        expect(rowById(b.body, '11').classList.contains('pdx-dg-row-selected')).toBe(false);

        // Grid A must be untouched (old code would have painted it).
        expect(rowById(a.body, '1').classList.contains('pdx-dg-row-selected')).toBe(false);
        expect(rowById(a.body, '2').classList.contains('pdx-dg-row-selected')).toBe(false);
    });
});
