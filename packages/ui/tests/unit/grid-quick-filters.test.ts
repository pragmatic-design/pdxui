// The filters a list is narrowed by are on screen before anybody opens a menu.
//
// A row of chips under the header, one per usual filter, empty and grey until set, and a search box.
// With «+ Add filter» and the active chips only, a reader would have to open a menu to learn what
// could be filtered at all.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, any>;

const ROWS = [
    { id: 1, subject: 'VPN drops', status: 'open', priority: 'high' },
    { id: 2, subject: 'Printer jam', status: 'closed', priority: 'low' },
    { id: 3, subject: 'VPN slow', status: 'closed', priority: 'normal' },
];
const STATUS = [{ label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }];

function columns(quick = true) {
    return [
        { field: 'subject', header: 'Subject', searchable: true },
        { field: 'status', header: 'Status', quickFilter: quick, filterOptions: STATUS,
          format: (v: unknown) => STATUS.find((s) => s.value === v)?.label ?? String(v) },
        { field: 'priority', header: 'Priority', quickFilter: quick },
    ];
}

async function mount(opts: { quick?: boolean; search?: boolean } = {}): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.setAttribute('show-toolbar', '');
    if (opts.search) el.setAttribute('search', '');
    el.columns = columns(opts.quick ?? true);
    el.data = ROWS;
    document.body.appendChild(el);
    await el.whenReady();
    await tick(30);
    return el;
}

const quickChips = (el: Grid) => [...el.querySelectorAll<HTMLElement>('.pdx-dg-toolbar-chip-quick')];
const rows = (el: Grid) => el.querySelectorAll('.pdx-dg-body [role="row"]').length;

beforeEach(cleanup);

describe('quick filters', () => {
    it('every quickFilter column has a chip before any filter is set, empty and named', async () => {
        const el = await mount();
        const chips = quickChips(el);
        expect(chips.map((c) => c.dataset.field)).toEqual(['status', 'priority']);
        expect(chips.every((c) => c.hasAttribute('data-empty')), 'a chip is not empty before any filter').toBe(true);
        expect(chips[0].textContent).toContain('Status');
    });

    it('a click opens the filter popover of its column', async () => {
        const el = await mount();
        quickChips(el)[0].click();
        await tick(20);
        expect(document.querySelector('.pdx-dg-filter-popover'), 'no popover opened').not.toBeNull();
    });

    it('set, the chip reads the value\'s label and the data is filtered; × returns it to empty', async () => {
        const el = await mount();
        el.grid.source.setFilter([{ field: 'status', operator: 'eq', value: 'closed' }]);
        await tick(40);
        expect(rows(el)).toBe(2);
        let chips = quickChips(el);
        expect(chips).toHaveLength(2);
        expect(chips[0].hasAttribute('data-empty')).toBe(false);
        expect(chips[0].textContent).toContain('Closed');

        (chips[0].querySelector('.pdx-dg-toolbar-chip-remove') as HTMLElement).click();
        await tick(40);
        chips = quickChips(el);
        expect(chips, 'removing it took the chip away').toHaveLength(2);
        expect(chips[0].hasAttribute('data-empty')).toBe(true);
        expect(rows(el)).toBe(3);
    });
});

describe('quick search', () => {
    it('a search field waits for the pause, then narrows over the searchable columns', async () => {
        const el = await mount({ search: true });
        const input = el.querySelector('[data-grid-search] input, input[data-grid-search]') as HTMLInputElement;
        expect(input, 'no search field').not.toBeNull();
        input.value = 'vpn';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick(100);
        expect(el.grid.source.search(), 'searched before the pause').toBe('');
        await tick(300);
        expect(el.grid.source.search()).toBe('vpn');
        await tick(30);
        expect(rows(el)).toBe(2);
        // No chip: a search is not a filter the reader built.
        expect(el.querySelectorAll('.pdx-dg-toolbar-chip-filter')).toHaveLength(0);

        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick(400);
        expect(el.grid.source.search()).toBe('');
        expect(rows(el)).toBe(3);
    });
});

describe('control', () => {
    it('with no quickFilter and no search the toolbar is what it was: no chip, no field, «Add filter» with its word', async () => {
        const el = await mount({ quick: false });
        expect(quickChips(el)).toHaveLength(0);
        expect(el.querySelector('[data-grid-search]')).toBeNull();
        const add = [...el.querySelectorAll<HTMLElement>('.pdx-dg-toolbar-btn')].find((b) => b.getAttribute('aria-haspopup') === 'menu' && !b.hasAttribute('data-grid-export'));
        expect(add?.textContent).toMatch(/Add filter/i);
    });
});
