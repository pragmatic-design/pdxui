// The inline filter's operator menu and the toolbar's "+ Add Filter" menu work from the keyboard.
//
// Their items have a role, a tab stop and keys, not just a click handler. The operator button is
// named by the operator, not by its symbol ("⊃") with the operator only in `title`; Escape closes
// either menu, and opening one moves focus into it. A native button's Enter and Space are its click, so the
// triggers are clicked here; the keys inside the menus are pressed.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';
import '../../src/pagination/pdx-pagination';

type Grid = HTMLElement & Record<string, unknown>;

const PEOPLE = [
    { id: 1, name: 'Ada', city: 'Torino' },
    { id: 2, name: 'Grace', city: 'Milano' },
];
const COLS = [
    { field: 'name', header: 'Name' },
    { field: 'city', header: 'City' },
];

async function mountGrid(props: Record<string, unknown>): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    for (const [k, v] of Object.entries(props)) el[k] = v;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}
const key = (target: Element, k: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
const focused = () => document.activeElement as HTMLElement;

beforeEach(cleanup);

describe('the inline filter operator menu', () => {
    const opButton = (el: Element) =>
        el.querySelector<HTMLButtonElement>('.pdx-dg-filter-row [role="gridcell"]:first-child .pdx-dg-filter-op-btn')!;

    it('the button is named after its column and operator, and says it opens a menu', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, filterable: true });
        const btn = opButton(el);
        expect(btn.getAttribute('aria-label')).toBe('Name filter: Contains');
        expect(btn.getAttribute('aria-haspopup')).toBe('menu');
        expect(btn.getAttribute('aria-expanded')).toBe('false');
    });

    it('opens on the checked operator; ArrowDown and Enter pick the next one, and focus returns to the button', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, filterable: true });
        const btn = opButton(el);
        btn.focus();
        btn.click();
        expect(menu(), 'no role="menu" opened').not.toBeNull();
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        const items = [...menu()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
        expect(items.length).toBeGreaterThan(1);
        expect(focused()).toBe(items.find(i => i.getAttribute('aria-checked') === 'true'));
        expect(focused().textContent).toBe('Contains');

        const current = items.indexOf(focused());
        key(focused(), 'ArrowDown');
        const next = items[current + 1];
        expect(focused()).toBe(next);
        key(focused(), 'Enter');

        expect(menu()).toBeNull();
        expect(btn.getAttribute('aria-label')).toBe(`Name filter: ${next.textContent}`);
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        expect(focused()).toBe(btn);
    });

    it('Escape closes it and returns focus to the button, without picking', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, filterable: true });
        const btn = opButton(el);
        btn.focus();
        btn.click();
        key(focused(), 'ArrowDown');
        key(focused(), 'Escape');
        expect(menu()).toBeNull();
        expect(focused()).toBe(btn);
        expect(btn.getAttribute('aria-label')).toBe('Name filter: Contains');
        expect(btn.getAttribute('aria-expanded')).toBe('false');
    });
});

describe('the toolbar Add Filter menu', () => {
    const addButton = (el: Element) =>
        [...el.querySelectorAll<HTMLButtonElement>('.pdx-dg-toolbar button')].find(b => b.textContent?.includes('Add Filter'))!;

    it('says it opens a menu; the menu has a menuitem per column, and Enter on City opens the City filter', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, showToolbar: true });
        const btn = addButton(el);
        expect(btn.getAttribute('aria-haspopup')).toBe('menu');
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        btn.focus();
        btn.click();
        expect(menu(), 'no role="menu" opened').not.toBeNull();
        expect(menu()!.getAttribute('aria-label')).toBeTruthy();
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        const items = [...menu()!.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        expect(items.map(i => i.textContent)).toEqual(['Name', 'City']);
        expect(focused()).toBe(items[0]);

        key(focused(), 'ArrowDown');
        expect(focused()).toBe(items[1]);
        key(focused(), 'Enter');
        expect(menu()).toBeNull();
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        await tick(20);
        expect(document.querySelector('.pdx-dg-filter-popover')?.textContent).toContain('City');
    });

    it('Escape closes it and returns focus to the button', async () => {
        const el = await mountGrid({ columns: COLS, data: PEOPLE, showToolbar: true });
        const btn = addButton(el);
        btn.focus();
        btn.click();
        expect(menu(), 'no role="menu" opened').not.toBeNull();
        expect(focused().getAttribute('role')).toBe('menuitem');
        key(focused(), 'Escape');
        expect(menu()).toBeNull();
        expect(focused()).toBe(btn);
        expect(document.querySelector('.pdx-dg-filter-popover')).toBeNull();
    });
});
