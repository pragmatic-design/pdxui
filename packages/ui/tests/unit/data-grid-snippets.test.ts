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

// #673: the grid's other scoped slots get a snippet each, with the slot's context as arguments. The
// snippet wins, the alpha slot is the fallback, and both draw in the same place.

describe('pdx-data-grid: editCell(row, column, value, form) (#673)', () => {
    const editing = (el: Grid) => el.querySelector('.pdx-dg-cell-editing');
    const startEdit = async (el: Grid) => {
        (el.startEdit as (id: unknown, field: string) => void)(1, 'name');
        await tick(20);
    };
    const editor = (value: unknown) => {
        const input = document.createElement('input');
        input.className = 'mine';
        input.value = String(value);
        return input;
    };

    it('the alpha scoped slot col-edit:name still draws the editor (control)', async () => {
        const el = await mountGrid({ editable: true }, scopedSlot('col-edit:name', (s) => editor(s.value)));
        await startEdit(el);
        expect(editing(el)?.querySelector('input.mine')).not.toBeNull();
    });

    it('a snippet draws the editor in the same cell, with the row, the column, the value and the form', async () => {
        const seen: unknown[][] = [];
        const el = await mountGrid({ editable: true }, (g) => {
            g.editCell = (row: Row, column: Col, value: unknown, form: unknown) => {
                seen.push([row.name, column.field, value, form]);
                return column.field === 'name' ? editor(value) : null;
            };
        });
        await startEdit(el);
        expect(editing(el)?.querySelector('input.mine')).not.toBeNull();
        // A cell edit has no form: the grid makes one only for a row edit (grid-edit.ts, startRowEdit).
        expect(seen).toEqual([['Ada', 'name', 'Ada', null]]);
    });

    it('a snippet that draws nothing for the column leaves the grid\'s own editor', async () => {
        const el = await mountGrid({ editable: true }, (g) => { g.editCell = () => null; });
        await startEdit(el);
        expect(editing(el)?.querySelector('.mine')).toBeNull();
        expect(editing(el)?.childElementCount).toBeGreaterThan(0);
    });

    it('Enter commits what was typed in the snippet\'s editor, and saves it to the row', async () => {
        const el = await mountGrid({ editable: true }, (g) => {
            g.editCell = (_row: Row, column: Col, value: unknown) => (column.field === 'name' ? editor(value) : null);
        });
        const ends: unknown[] = [];
        el.addEventListener('pdx-cell-edit-end', (e) => ends.push((e as CustomEvent).detail));
        await startEdit(el);
        const input = editing(el)?.querySelector('input.mine') as HTMLInputElement;
        input.value = 'Zed';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await tick(20);
        expect(ends).toEqual([{ rowId: 1, field: 'name', oldValue: 'Ada', newValue: 'Zed' }]);
        expect(cellsOf(el, 0)[0]).toBe('Zed');
    });
});

describe('pdx-data-grid: filter(column) (#673)', () => {
    it('the alpha scoped slot filter:name still draws in the filter row (control)', async () => {
        const el = await mountGrid({ filterable: true }, scopedSlot('filter:name', (s) => mark(`f ${s.field}`)));
        expect(mine()).toEqual(['f name']);
        expect(el.querySelector('.pdx-dg-filter-row .mine')).not.toBeNull();
    });

    it('a snippet draws the same filter cell, and the other columns keep the grid\'s', async () => {
        const plain = await mountGrid({ filterable: true });
        const inputs = plain.querySelectorAll('.pdx-dg-filter-row input').length;
        cleanup();
        const el = await mountGrid({ filterable: true }, (g) => {
            g.filter = (column: Col) => (column.field === 'name' ? mark(`f ${column.field}`) : null);
        });
        expect(mine()).toEqual(['f name']);
        expect(el.querySelector('.pdx-dg-filter-row .mine')).not.toBeNull();
        expect(el.querySelectorAll('.pdx-dg-filter-row input').length, 'the price column keeps its own filter input').toBe(inputs - 1);
    });
});

describe('pdx-data-grid: filterPopover(column, apply, clear) (#673)', () => {
    type Popover = (column: Col, apply: () => void, clear: () => void) => Node | null;
    const popover = () => document.querySelector('.pdx-dg-filter-popover');

    async function openWith(give: (el: Grid) => void) {
        const el = await mountGrid({}, give);
        const source = (el.grid as { source: { setFilter(f: unknown[]): void } }).source;
        const calls: unknown[][] = [];
        const setFilter = source.setFilter.bind(source);
        source.setFilter = (f: unknown[]) => { calls.push(f); setFilter(f); };
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        (el.openFilterPopover as (field: string, a: HTMLElement) => void)('name', anchor);
        await tick(20);
        return { el, calls };
    }

    for (const [kind, give] of [
        ['the alpha scoped slot filter-popover:name (control)', (handles: { apply?: () => void; clear?: () => void }) =>
            scopedSlot('filter-popover:name', (s) => { handles.apply = s.apply as () => void; handles.clear = s.clear as () => void; return mark('custom'); })],
        ['a snippet', (handles: { apply?: () => void; clear?: () => void }) => (g: Grid) => {
            g.filterPopover = ((column, apply, clear) => {
                handles.apply = apply; handles.clear = clear;
                return column.field === 'name' ? mark('custom') : null;
            }) as Popover;
        }],
    ] as const) {
        it(`${kind}: draws in the popover; apply() applies the filters and closes it, clear() clears them and closes it`, async () => {
            const handles: { apply?: () => void; clear?: () => void } = {};
            const first = await openWith(give(handles));
            expect(popover()?.querySelector('.mine')?.textContent).toBe('custom');
            handles.apply!();
            await tick(20);
            expect(popover(), 'apply closed the popover').toBeNull();
            expect(first.calls).toHaveLength(1);
            cleanup();

            const second = await openWith(give(handles));
            handles.clear!();
            await tick(20);
            expect(popover(), 'clear closed the popover').toBeNull();
            expect(second.calls).toEqual([[]]);
        });
    }

    it('a snippet that draws nothing for the column leaves the grid\'s own popover', async () => {
        await openWith((g) => { g.filterPopover = (() => null) as Popover; });
        expect(document.querySelector('.mine')).toBeNull();
        expect(document.querySelector('.pdx-dg-fp-title, [role="dialog"]')).not.toBeNull();
    });
});

describe('pdx-data-grid: toolbarStart(grid) and toolbarEnd(grid) (#673)', () => {
    const toolbar = (el: Element) => el.querySelector('[data-part="toolbar"]');

    it('the alpha scoped slots toolbar-start and toolbar-end still draw (control)', async () => {
        const el = await mountGrid({ showToolbar: true }, (g) => {
            scopedSlot('toolbar-start', () => mark('start'))(g);
            scopedSlot('toolbar-end', () => mark('end'))(g);
        });
        expect([...toolbar(el)!.querySelectorAll('.mine')].map((n) => n.textContent)).toEqual(['start', 'end']);
    });

    it('snippets draw at the same two places, and receive the grid', async () => {
        const got: unknown[] = [];
        const el = await mountGrid({ showToolbar: true }, (g) => {
            g.toolbarStart = (grid: unknown) => { got.push(grid); return mark('start'); };
            g.toolbarEnd = (grid: unknown) => { got.push(grid); return mark('end'); };
        });
        const marks = [...toolbar(el)!.querySelectorAll('.mine')];
        expect(marks.map((n) => n.textContent)).toEqual(['start', 'end']);
        expect(got).toHaveLength(2);
        expect(got.every((g) => g === el.grid && g !== null)).toBe(true);
    });
});

describe('pdx-data-grid: empty() (#673)', () => {
    const status = (el: Element) => el.querySelector('[data-part="empty"]');

    it('the alpha scoped slot empty still draws the empty state (control)', async () => {
        const el = await mountGrid({ data: [] }, scopedSlot('empty', () => mark('nothing here')));
        expect(status(el)?.querySelector('.mine')?.textContent).toBe('nothing here');
    });

    it('a snippet draws the empty state in the same place, and the grid\'s own is not drawn', async () => {
        const plain = await mountGrid({ data: [] });
        const own = status(plain)?.textContent;
        cleanup();
        const el = await mountGrid({ data: [] }, (g) => { g.empty = () => mark('nothing here'); });
        expect(status(el)?.querySelector('.mine')?.textContent).toBe('nothing here');
        expect(status(el)?.textContent).not.toBe(own);
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
