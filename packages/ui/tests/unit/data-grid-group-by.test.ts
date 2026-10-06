// «Group by» a reader can choose.
//
// The `groupBy` prop and a drag onto the group bar are not enough on their own: a drag is a gesture
// no keyboard and no finger can make. A column opts in with
// `groupable`, and the toolbar offers them in a menu; the grouping shows as a chip beside the sort's,
// and the group headers read the column's own words, not its codes.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { createDataSource } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

type Grid = HTMLElement & Record<string, unknown>;

const TICKETS = [
    { id: 1, subject: 'Printer', status: 'open' },
    { id: 2, subject: 'VPN', status: 'closed' },
    { id: 3, subject: 'Laptop', status: 'open' },
];
const WORDS: Record<string, string> = { open: 'Open', closed: 'Closed' };
const COLS = [
    { field: 'subject', header: 'Subject' },
    { field: 'status', header: 'Status', groupable: true, format: (v: unknown) => WORDS[String(v)] ?? String(v) },
];

async function mount(columns: unknown[]) {
    const source = createDataSource({ data: TICKETS.slice(), pageSize: 10 });
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = columns;
    el.source = source;
    el.showToolbar = true;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return { el, source };
}

const groupButton = (el: Element) => el.querySelector('[data-grid-group]') as HTMLButtonElement | null;
const menuItems = () => [...document.querySelectorAll('.pdx-dg-col-menu [role="menuitemradio"]')] as HTMLElement[];

beforeEach(cleanup);

describe('Group by, from the toolbar', () => {
    it('offers the groupable columns, and «None»', async () => {
        const { el } = await mount(COLS);
        expect(groupButton(el), 'no «Group by» in the toolbar').not.toBeNull();
        expect(groupButton(el)!.getAttribute('aria-label')).toBe('Group by');
        groupButton(el)!.click();
        await tick();
        expect(menuItems().map(i => i.textContent?.trim())).toEqual(['None', 'Status']);
        expect(menuItems()[0].getAttribute('aria-checked'), '«None» is the current choice').toBe('true');
    });

    it('choosing a column groups by it, and the group headers read its words', async () => {
        const { el, source } = await mount(COLS);
        groupButton(el)!.click();
        await tick();
        menuItems()[1].click();
        await tick(40);
        expect(source.group()).toEqual([{ field: 'status' }]);
        const labels = [...el.querySelectorAll('.pdx-dg-group-label')].map(l => l.textContent?.trim());
        expect(labels).toEqual(['Status: Closed', 'Status: Open']);
    });

    it('the grouping is a chip, and its ✕ takes it away', async () => {
        const { el, source } = await mount(COLS);
        groupButton(el)!.click();
        await tick();
        menuItems()[1].click();
        await tick(40);
        const chip = el.querySelector('.pdx-dg-toolbar-chip-group') as HTMLElement;
        expect(chip?.textContent).toContain('Status');
        (chip.querySelector('button') as HTMLButtonElement).click();
        await tick(40);
        expect(source.group()).toEqual([]);
        expect(el.querySelector('.pdx-dg-toolbar-chip-group')).toBeNull();
        expect(el.querySelectorAll('.pdx-dg-group-row')).toHaveLength(0);
    });

    it('control — a grid with no groupable column offers no «Group by»', async () => {
        const { el } = await mount(COLS.map(c => ({ ...c, groupable: false })));
        expect(groupButton(el)).toBeNull();
    });
});
