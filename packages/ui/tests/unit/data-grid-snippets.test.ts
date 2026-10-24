// Typed snippets for pdx-data-grid (#597, part 3d of #131).
//
// The grid's scoped slots are per column, `col:{field}` and `header:{field}`, and a snippet's name is
// an identifier: `@snippet cell:price(…)` cannot be written. So the grid takes one snippet for every
// column (the owner's direction, 2026-10-21): `cell(row, column, value)` and `header(column)`, which
// switch on `column.field`, and `detail(row)`. A column the snippet draws nothing for is the grid's
// to draw, so a page writes only the columns it changes. The alpha scoped slots keep working.

import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, unknown>;
type Row = Record<string, unknown>;
type Col = { field: string; header?: string };

const DATA = [{ id: 1, name: 'Ada', price: 3 }, { id: 2, name: 'Grace', price: 5 }];
const COLS = [{ field: 'name', header: 'Name' }, { field: 'price', header: 'Price', type: 'number' }];

async function mountGrid(props: Record<string, unknown>, give?: (el: Grid) => void): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    Object.assign(el, { columns: COLS, data: DATA }, props);
    give?.(el);
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

function mark(text: string): Node {
    const b = document.createElement('b');
    b.className = 'mine';
    b.textContent = text;
    return b;
}

/** What compiled parent code hands a component for `<slot name="x" let:…>`. */
function scopedSlot(name: string, draw: (scope: Row) => Node) {
    return (el: Grid) => {
        const carrier = document.createElement('template') as HTMLTemplateElement & { __pdxSlot?: unknown; __pdxSlotName?: string };
        carrier.__pdxSlotName = name;
        carrier.__pdxSlot = draw;
        el.appendChild(carrier);
    };
}

const mine = () => [...document.querySelectorAll('.mine')].map((n) => n.textContent);
const cellsOf = (el: Element, col: number) =>
    [...el.querySelectorAll('.pdx-dg-body .pdx-dg-row')].map((r) => r.querySelectorAll('[role="gridcell"]')[col]?.textContent?.trim());
const headerTexts = (el: Element) => [...el.querySelectorAll('.pdx-dg-th-label')].map((h) => h.textContent?.trim());

beforeEach(cleanup);

describe('pdx-data-grid: cell(row, column, value) (#597)', () => {
    it('the alpha scoped slot col:name still draws its column (control)', async () => {
        await mountGrid({}, scopedSlot('col:name', (s) => mark(`${(s.row as Row).name}`)));
        expect(mine()).toEqual(['Ada', 'Grace']);
    });

    it('a snippet draws the same cells as col:name, and leaves the other columns to the grid', async () => {
        const plain = await mountGrid({});
        const prices = cellsOf(plain, 1);
        cleanup();
        const el = await mountGrid({}, (g) => {
            g.cell = (row: Row, column: Col) => (column.field === 'name' ? mark(String(row.name)) : null);
        });
        expect(mine()).toEqual(['Ada', 'Grace']);
        expect(cellsOf(el, 1), 'the price column is the grid\'s own rendering').toEqual(prices);
    });

    it('a snippet that renders an empty fragment for a column leaves it to the grid too', async () => {
        const plain = await mountGrid({});
        const prices = cellsOf(plain, 1);
        cleanup();
        const el = await mountGrid({}, (g) => {
            g.cell = (row: Row, column: Col) => {
                const frag = document.createDocumentFragment();
                frag.appendChild(document.createComment('if'));
                if (column.field === 'name') frag.appendChild(mark(String(row.name)));
                return frag;
            };
        });
        expect(mine()).toEqual(['Ada', 'Grace']);
        expect(cellsOf(el, 1)).toEqual(prices);
    });

    it('takes the value the grid would draw: a computed column\'s', async () => {
        const cols = [...COLS, { field: 'total', header: 'Total', compute: (r: Row) => (r.price as number) * 2 }];
        await mountGrid({ columns: cols }, (g) => {
            g.cell = (_row: Row, column: Col, value: unknown) => (column.field === 'total' ? mark(`=${value}`) : null);
        });
        expect(mine()).toEqual(['=6', '=10']);
    });

    it('a command column the snippet leaves alone keeps its Edit/Delete; one it draws does not', async () => {
        const cols = [...COLS, { field: '__cmd', header: 'Actions', command: true }];
        const left = await mountGrid({ columns: cols, editable: true }, (g) => {
            g.cell = (row: Row, column: Col) => (column.field === 'name' ? mark(String(row.name)) : null);
        });
        expect(left.querySelectorAll('.pdx-dg-edit-actions')).toHaveLength(2);
        cleanup();
        const drawn = await mountGrid({ columns: cols, editable: true }, (g) => {
            g.cell = (row: Row, column: Col) => (column.field === '__cmd' ? mark(`open ${row.id}`) : null);
        });
        expect(drawn.querySelectorAll('.pdx-dg-edit-actions')).toHaveLength(0);
        expect(mine()).toEqual(['open 1', 'open 2']);
    });

    it('draws a virtual grid\'s cells too', async () => {
        await mountGrid({ virtualScroll: true, rowHeight: 40, maxHeight: 400 }, (g) => {
            g.cell = (row: Row, column: Col) => (column.field === 'name' ? mark(String(row.name)) : null);
        });
        expect(mine()).toEqual(['Ada', 'Grace']);
    });
});

describe('pdx-data-grid: header(column) (#597)', () => {
    it('the alpha scoped slot header:price still draws its header (control)', async () => {
        await mountGrid({}, scopedSlot('header:price', (s) => mark(`[${s.header}]`)));
        expect(mine()).toEqual(['[Price]']);
    });

    it('a snippet draws the same header, and the other columns keep their titles', async () => {
        const el = await mountGrid({}, (g) => {
            g.header = (column: Col) => (column.field === 'price' ? mark(`[${column.header}]`) : null);
        });
        expect(mine()).toEqual(['[Price]']);
        expect(headerTexts(el)).toEqual(['Name', '[Price]']);
    });
});

describe('pdx-data-grid: detail(row) (#597)', () => {
    const open = async (el: Grid) => {
        (el.querySelector('.pdx-dg-body .pdx-dg-expand-btn') as HTMLButtonElement).click();
        await tick(20);
    };

    it('the alpha scoped slot detail still draws (control)', async () => {
        const el = await mountGrid({ expandable: true }, scopedSlot('detail', (s) => mark(`about ${(s.row as Row).name}`)));
        await open(el);
        expect(mine()).toEqual(['about Ada']);
    });

    it('a snippet draws the same detail', async () => {
        const el = await mountGrid({ expandable: true }, (g) => {
            g.detail = (row: Row) => mark(`about ${row.name}`);
        });
        await open(el);
        expect(mine()).toEqual(['about Ada']);
    });
});

describe("a parent's @snippet cell, compiled (#597)", () => {
    it('switches on column.field, and the columns it does not draw are the grid\'s', async () => {
        const src = `<template>
  <pdx-data-grid :columns="cols" :data="rows">
    @snippet cell(row, column) { @if (column.field === 'name') { <b class="mine">{{ row.name }}!</b> } }
  </pdx-data-grid>
</template>
<script>
let cols = $signal([{ field: 'name', header: 'Name' }, { field: 'price', header: 'Price', type: 'number' }]);
let rows = $signal([{ id: 1, name: 'Ada', price: 3 }, { id: 2, name: 'Grace', price: 5 }]);
</script>
`;
        const plain = await mountGrid({});
        const prices = cellsOf(plain, 1);
        cleanup();

        const { code, warnings } = compile(src, 'snip-grid-page.pdx', [], undefined, {});
        expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
        const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
        expect(body, 'the page imports something besides @pdxui/core').not.toMatch(/^import /m);
        new Function('__core', body)(core);

        const page = document.createElement('app-snip-grid-page');
        document.body.appendChild(page);
        await tick(40);
        await tick(20);
        expect(mine()).toEqual(['Ada!', 'Grace!']);
        expect(cellsOf(page, 1)).toEqual(prices);
    });
});
