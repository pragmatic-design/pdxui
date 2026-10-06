// pdx-data-grid as a grid: keyboard navigation for every grid, sortable headers with aria-sort, a
// name and row counts, selection state, named controls, group toggles, an empty state that says
// so.
//
// The arrows move between cells whether or not the grid is `editable`; a sortable header carries
// aria-sort, not only a click handler on a div; the grid has a name, aria-rowcount and
// aria-rowindex; a checked row has aria-selected; the filter inputs, the column chooser's checkboxes
// and the group rows have names; an empty grid does not show "1–0 of 0" and an active page 1.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { createDataSource } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';
import '../../src/pagination/pdx-pagination';

type Grid = HTMLElement & Record<string, unknown>;

const PEOPLE = [
    { id: 1, name: 'Ada', city: 'Torino', category: 'Books' },
    { id: 2, name: 'Grace', city: 'Milano', category: 'Books' },
    { id: 3, name: 'Katherine', city: 'Torino', category: 'Music' },
];
const COLS = [
    { field: 'name', header: 'Name', sortable: true },
    { field: 'city', header: 'City', sortable: false },   // columns sort by default
];

async function mountGrid(props: Record<string, unknown>): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    for (const [k, v] of Object.entries(props)) el[k] = v;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}
const key = (target: Element, k: string, extra: KeyboardEventInit = {}) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
const grid = (el: Element) => el.querySelector('[role="grid"]') as HTMLElement;
/** The one element of the grid's cells that is in the tab order. */
function tabStop(el: Element): HTMLElement {
    const stops = [...grid(el).querySelectorAll<HTMLElement>('[role="row"] [tabindex="0"]')];
    expect(stops, 'the grid must have exactly one roving tab stop').toHaveLength(1);
    return stops[0];
}
/** The cell a focus target belongs to. */
const cellOf = (n: Element) => n.closest('[role="gridcell"], [role="columnheader"]') as HTMLElement;

beforeEach(cleanup);

describe('keyboard navigation in a read-only grid', () => {
    it('one tab stop, on the first header cell; arrows, Home/End and Ctrl+Home/End move it', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE });
        const first = tabStop(el);
        expect(cellOf(first).textContent).toContain('Name');
        first.focus();

        key(document.activeElement!, 'ArrowDown');
        await tick();
        expect(cellOf(document.activeElement!).textContent).toBe('Ada');
        expect(tabStop(el)).toBe(document.activeElement);

        key(document.activeElement!, 'ArrowRight');
        await tick();
        expect(cellOf(document.activeElement!).textContent).toBe('Torino');

        key(document.activeElement!, 'Home');
        await tick();
        expect(cellOf(document.activeElement!).textContent).toBe('Ada');

        key(document.activeElement!, 'End', { ctrlKey: true });
        await tick();
        expect(cellOf(document.activeElement!).textContent).toBe('Torino');
        expect(document.activeElement!.closest('[role="row"]')?.textContent).toContain('Katherine');

        key(document.activeElement!, 'Home', { ctrlKey: true });
        await tick();
        expect(cellOf(document.activeElement!).textContent).toContain('Name');
    });

    it('Enter starts editing a data cell only in an editable grid', async () => {
        const readOnly = await mountGrid({ columns: COLS, data: PEOPLE });
        tabStop(readOnly).focus();
        key(document.activeElement!, 'ArrowDown');
        key(document.activeElement!, 'Enter');
        await tick(20);
        expect(readOnly.querySelector('.pdx-dg-cell-editing'), 'a read-only grid does not edit').toBeNull();
        readOnly.remove();

        const editable = await mountGrid({ columns: COLS, data: PEOPLE, editable: true });
        tabStop(editable).focus();
        key(document.activeElement!, 'ArrowDown');
        expect(cellOf(document.activeElement!).textContent).toBe('Ada');
        key(document.activeElement!, 'Enter');
        await tick(20);
        const editing = editable.querySelector('.pdx-dg-cell-editing');
        expect(editing?.getAttribute('data-field')).toBe('name');
        expect(editing?.closest('[role="row"]')?.getAttribute('data-row-id')).toBe('1');
    });

    it('a vertical move keeps its column through a group row, which has one cell', async () => {
        const el = await mountGrid({ columns: [...COLS, { field: 'category', header: 'Category' }], data: PEOPLE, groupBy: [{ field: 'category' }] });
        await tick(20);
        tabStop(el).focus();
        key(document.activeElement!, 'ArrowRight');           // City
        key(document.activeElement!, 'ArrowDown');            // the Books group's toggle
        expect(document.activeElement!.getAttribute('aria-label')).toBe('Category: Books, 2 rows');
        key(document.activeElement!, 'ArrowDown');            // Ada's City, not Ada's Name
        expect(cellOf(document.activeElement!).textContent).toBe('Torino');
        expect(document.activeElement!.closest('[role="row"]')?.textContent).toContain('Ada');
    });

    it('the focused cell survives a re-sort: same row, same column, still focused', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE });
        tabStop(el).focus();
        key(document.activeElement!, 'ArrowDown');
        key(document.activeElement!, 'ArrowDown');            // Grace, second row
        expect(cellOf(document.activeElement!).textContent).toBe('Grace');
        (el.grid as { source: { setSort(s: unknown[]): void } }).source.setSort([{ field: 'name', dir: 'desc' }]);
        await tick(40);
        expect(cellOf(document.activeElement!).textContent).toBe('Grace');
        expect(tabStop(el)).toBe(document.activeElement);
        // Katherine, Grace, Ada: Grace is still the second body row, and the one ArrowUp leaves is the first.
        key(document.activeElement!, 'ArrowUp');
        expect(cellOf(document.activeElement!).textContent).toBe('Katherine');
    });
});

describe('virtual scrolling and row detail', () => {
    it('a virtual grid counts every row, and a rendered row knows its place in all of them', async () => {
        const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, city: 'X' }));
        const el = await mountGrid({ columns: COLS, data: rows, virtualScroll: true });
        const g = grid(el);
        expect(g.getAttribute('aria-rowcount')).toBe('1001');
        const first = g.querySelector('.pdx-dg-body [role="row"]')!;
        expect(first.textContent).toContain('P1');
        expect(first.getAttribute('aria-rowindex')).toBe('2');
    });

    it('the detail toggle says whether its row is open', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, expandable: true });
        const btn = () => grid(el).querySelector('.pdx-dg-body .pdx-dg-expand-btn') as HTMLButtonElement;
        expect(btn().getAttribute('aria-expanded')).toBe('false');
        btn().click();
        await tick(20);
        expect(btn().getAttribute('aria-expanded')).toBe('true');
        // Its header cell is a columnheader with a name, so the header row has a body row's columns.
        const header = grid(el).querySelector('.pdx-dg-header')!;
        expect(header.querySelector('.pdx-dg-expand-cell')!.getAttribute('role')).toBe('columnheader');
        expect(g_cells(header)).toBe(g_cells(grid(el).querySelector('.pdx-dg-body [role="row"]')!));
    });
});

const g_cells = (row: Element) => [...row.children].filter(c => /^(gridcell|columnheader)$/.test(c.getAttribute('role') ?? '')).length;

describe('sortable headers', () => {
    it('Enter on the focused header sorts, and the columnheader says so with aria-sort', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE });
        const th = () => grid(el).querySelector('[role="columnheader"][data-field="name"]') as HTMLElement;
        expect(th().getAttribute('aria-sort')).toBe('none');
        const sortBtn = th().querySelector('button.pdx-dg-sort-btn') as HTMLButtonElement;
        expect(sortBtn, 'the sort control is a button').toBeTruthy();
        expect(tabStop(el)).toBe(sortBtn);

        sortBtn.focus();
        sortBtn.click();                       // Enter/Space on a focused button is a click
        await tick(20);
        expect(th().getAttribute('aria-sort')).toBe('ascending');
        expect(document.activeElement, 'focus survives the header rebuild').toBe(th().querySelector('button.pdx-dg-sort-btn'));

        (th().querySelector('button.pdx-dg-sort-btn') as HTMLButtonElement).click();
        await tick(20);
        expect(th().getAttribute('aria-sort')).toBe('descending');
        expect(grid(el).querySelector('[role="columnheader"][data-field="city"]')!.hasAttribute('aria-sort')).toBe(false);
    });

    // Multi-sort — Shift+click — says so: a hint, a way from the keyboard, and the order of the
    // levels on the headers with a toolbar as well as without one.
    const BOTH = [
        { field: 'name', header: 'Name', sortable: true },
        { field: 'city', header: 'City', sortable: true },
    ];
    const header = (el: Element, field: string) => grid(el).querySelector(`[role="columnheader"][data-field="${field}"]`) as HTMLElement;
    const sortButton = (el: Element, field: string) => header(el, field).querySelector('button.pdx-dg-sort-btn') as HTMLButtonElement;
    const badge = (el: Element, field: string) => header(el, field).querySelector('.pdx-dg-sort-badge')?.textContent ?? null;

    it('Shift+Enter on a second header adds it to the sort, as Shift+click does', async () => {
        const el = await mountGrid({ columns: BOTH, data: PEOPLE });
        sortButton(el, 'name').click();
        await tick(20);
        sortButton(el, 'city').focus();
        key(sortButton(el, 'city'), 'Enter', { shiftKey: true });
        await tick(20);
        expect(badge(el, 'name'), 'the first level lost its number').toBe('1');
        expect(badge(el, 'city'), 'Shift+Enter did not add a level').toBe('2');
    });

    it('with a toolbar, each sorted header still carries its position, and so does its chip', async () => {
        const el = await mountGrid({ columns: BOTH, data: PEOPLE, showToolbar: true });
        sortButton(el, 'name').click();
        await tick(20);
        sortButton(el, 'city').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
        await tick(20);
        expect([badge(el, 'name'), badge(el, 'city')]).toEqual(['1', '2']);
        const chips = [...el.querySelectorAll('.pdx-dg-toolbar-chip-sort')].map(c => c.textContent?.replace('✕', '').trim());
        expect(chips).toEqual(['1Name', '2City']);
        // Said, not only drawn: the header's description names the position.
        expect(header(el, 'city').getAttribute('aria-description')).toBe('Sort 2 of 2, Ascending');
    });

    it('a sortable header says how to add it to the sort', async () => {
        const el = await mountGrid({ columns: BOTH, data: PEOPLE });
        expect(sortButton(el, 'name').title).toBe('Name · Shift+click to add to the sort');
    });

    it('control — a plain click replaces the sort with one level, and one level draws no number', async () => {
        const el = await mountGrid({ columns: BOTH, data: PEOPLE, showToolbar: true });
        sortButton(el, 'name').click();
        await tick(20);
        sortButton(el, 'city').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
        await tick(20);
        sortButton(el, 'name').click();
        await tick(20);
        expect([badge(el, 'name'), badge(el, 'city')]).toEqual([null, null]);
        expect(el.querySelectorAll('.pdx-dg-toolbar-chip-sort')).toHaveLength(1);
    });
});

describe('name and counts', () => {
    it('label names the grid; a paginated grid of 100 rows counts them all, and page 2 starts at row 12', async () => {
        const rows = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, city: 'X' }));
        const source = createDataSource({ data: rows, pageSize: 10 });
        const el = await mountGrid({ columns: COLS, source, label: 'People' });
        const g = grid(el);
        expect(g.getAttribute('aria-label')).toBe('People');
        expect(g.getAttribute('aria-rowcount')).toBe('101');
        expect(g.getAttribute('aria-colcount')).toBe('2');
        expect(g.querySelector('.pdx-dg-header')!.getAttribute('aria-rowindex')).toBe('1');
        source.setPage(2);
        await tick(40);
        const firstRow = g.querySelector('.pdx-dg-body [role="row"]')!;
        expect(firstRow.textContent).toContain('P11');
        expect(firstRow.getAttribute('aria-rowindex')).toBe('12');
    });
});

describe('selection', () => {
    it('a checked row is aria-selected, and a multiple-selection grid is multiselectable', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, selection: 'multiple' });
        const g = grid(el);
        expect(g.getAttribute('aria-multiselectable')).toBe('true');
        const row = g.querySelector('.pdx-dg-body [role="row"]')!;
        expect(row.getAttribute('aria-selected')).toBe('false');
        (row.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
        await tick();
        expect(g.querySelector('.pdx-dg-body [role="row"]')!.getAttribute('aria-selected')).toBe('true');
    });
});

describe('named controls', () => {
    it('inline filter inputs are named after their column', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, filterable: true });
        await tick(20);
        const input = grid(el).querySelector('.pdx-dg-filter-row pdx-input')!;
        expect(input.getAttribute('aria-label')).toBe('Filter Name');
    });

    it('the toolbar is a named toolbar; Columns says whether its menu is open; its checkboxes are named', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, showToolbar: true });
        const bar = el.querySelector('.pdx-dg-toolbar')!;
        expect(grid(el).contains(bar), 'a toolbar is not a row: it sits beside the grid').toBe(false);
        expect(bar.getAttribute('role')).toBe('toolbar');
        expect(bar.getAttribute('aria-label')).toBeTruthy();
        const colBtn = bar.querySelector('[aria-label="Columns"]') as HTMLButtonElement;
        expect(colBtn.getAttribute('aria-expanded')).toBe('false');
        colBtn.click();
        await tick();
        expect(colBtn.getAttribute('aria-expanded')).toBe('true');
        const names = [...document.querySelectorAll('.pdx-dg-col-menu input[type="checkbox"]')].map(c => c.getAttribute('aria-label'));
        expect(names).toEqual(['Name', 'City']);
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await tick(20);
        expect(colBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('the clear-all-filters button is named, not "✕", and still clears the filters', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, showToolbar: true });
        const source = (el.grid as { source: { setFilter(f: unknown[]): void; filter: { peek(): unknown[] } } }).source;
        source.setFilter([{ field: 'city', operator: 'eq', value: 'Torino' }]);
        await tick(20);
        const clearAll = el.querySelector('.pdx-dg-toolbar-chip-remove-all') as HTMLButtonElement;
        expect(clearAll.style.display, 'shown while a filter is active').toBe('');
        expect(clearAll.getAttribute('aria-label')).toBe('Clear all filters');
        expect(clearAll.title).toBe('Clear all filters');
        const glyph = [...clearAll.childNodes].find(n => n.textContent?.includes('✕')) as HTMLElement;
        expect(glyph.nodeType, 'the ✕ is its own element, so it can be hidden').toBe(Node.ELEMENT_NODE);
        expect(glyph.getAttribute('aria-hidden')).toBe('true');
        clearAll.click();
        await tick(20);
        expect(source.filter.peek()).toEqual([]);
        expect(clearAll.style.display).toBe('none');
    });
});

describe('group rows', () => {
    it('a group row has a toggle button with aria-expanded and a name with its count', async () => {
        const el = await mountGrid({ columns: [...COLS, { field: 'category', header: 'Category' }], data: PEOPLE, groupBy: [{ field: 'category' }] });
        await tick(20);
        const toggle = () => [...grid(el).querySelectorAll<HTMLButtonElement>('.pdx-dg-group-row button')]
            .find(b => (b.getAttribute('aria-label') ?? '').startsWith('Category: Books'))!;
        expect(toggle(), 'no group toggle button').toBeTruthy();
        expect(toggle().getAttribute('aria-label')).toBe('Category: Books, 2 rows');
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
        toggle().click();
        await tick(20);
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });
});

describe('the empty state', () => {
    it('says so in a status, and the pager shows 0 of 0 with no page buttons', async () => {
        const source = createDataSource({ data: [] as Record<string, unknown>[], pageSize: 10 });
        const el = await mountGrid({ columns: COLS, source });
        await tick(40);
        const empty = el.querySelector('.pdx-dg-empty') as HTMLElement;
        expect(empty.getAttribute('role')).toBe('status');
        const pager = el.querySelector('pdx-pagination')!;
        expect(pager.querySelector('.pdx-pagination-info')?.textContent).toBe('0 of 0');
        // Page numbers are button.pdx-page with a digit for text (prev/next/edges are named arrows).
        const numbers = [...pager.querySelectorAll('button.pdx-page')].filter(b => /^\d+$/.test(b.textContent ?? ''));
        expect(numbers).toHaveLength(0);
        expect(pager.querySelector('[aria-current="page"]')).toBeNull();
    });
});
