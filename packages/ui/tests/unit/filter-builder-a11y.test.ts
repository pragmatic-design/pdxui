// pdx-filter-builder's add flow, and the grid's filter popover it shares, from the keyboard.
//
// "+ Add Filter" has aria-haspopup/expanded and moves focus into what it opens; the field popover and
// the value popover (.pdx-dg-filter-popover, shared with pdx-data-grid) have a role and a name;
// Escape closes either; after Apply focus does not fall to <body>.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/filter-builder/pdx-filter-builder';
import '../../src/data-grid/pdx-data-grid';

const FIELDS = [
    { field: 'name', label: 'Name', type: 'string', operators: ['contains', 'eq'] },
    { field: 'category', label: 'Category', type: 'string', operators: ['in'],
      options: [{ label: 'Books', value: 'Books' }, { label: 'Music', value: 'Music' }] },
    { field: 'city', label: 'City', type: 'string', operators: ['in'],
      options: [{ label: 'Torino', value: 'Torino' }] },
];

async function mountBuilder(): Promise<{ el: HTMLElement; changes: unknown[] }> {
    const el = document.createElement('pdx-filter-builder');
    (el as unknown as { fields: unknown }).fields = FIELDS;
    const changes: unknown[] = [];
    el.addEventListener('pdx-filter-change', (e) => changes.push((e as CustomEvent).detail));
    document.body.appendChild(el);
    await tick(20);
    return { el, changes };
}

const addBtn = (el: Element) => el.querySelector('.pdx-fb-add-btn') as HTMLButtonElement;
const picker = () => document.querySelector('.pdx-fb-popover') as HTMLElement | null;
const valuePop = () => document.querySelector('.pdx-dg-filter-popover') as HTMLElement | null;
const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

/** Open the add flow on `label`, tick "Books"-like options by label, and Apply. */
async function addEnumFilter(el: Element, fieldLabel: string, optionLabel: string): Promise<void> {
    addBtn(el).focus();
    addBtn(el).click();
    await tick();
    const item = [...picker()!.querySelectorAll('button')].find(b => b.textContent === fieldLabel)!;
    item.focus();
    item.click();
    await tick();
    const row = [...valuePop()!.querySelectorAll('label')].find(l => l.textContent === optionLabel)!;
    (row.querySelector('input') as HTMLInputElement).click();
    const apply = valuePop()!.querySelectorAll('.pdx-dg-fp-actions > *')[1] as HTMLElement;
    apply.focus?.();
    apply.click();
    await tick();
}

beforeEach(() => { cleanup(); document.querySelectorAll('.pdx-fb-popover, .pdx-dg-filter-popover').forEach(p => p.remove()); });

describe('the field picker', () => {
    it('"+ Add Filter" declares a dialog, opens a named dialog, and moves focus into it', async () => {
        const { el } = await mountBuilder();
        expect(addBtn(el).getAttribute('aria-haspopup')).toBe('dialog');
        expect(addBtn(el).getAttribute('aria-expanded')).toBe('false');
        addBtn(el).focus();
        addBtn(el).click();
        await tick();
        expect(addBtn(el).getAttribute('aria-expanded')).toBe('true');
        expect(picker()!.getAttribute('role')).toBe('dialog');
        expect(picker()!.getAttribute('aria-label')).toBe('Add filter');
        expect(document.activeElement?.textContent).toBe('Name');
    });

    it('Escape closes it and returns focus to the button', async () => {
        const { el } = await mountBuilder();
        addBtn(el).focus();
        addBtn(el).click();
        await tick();
        key(document.activeElement!, 'Escape');
        await tick();
        expect(picker()).toBeNull();
        expect(document.activeElement).toBe(addBtn(el));
        expect(addBtn(el).getAttribute('aria-expanded')).toBe('false');
    });
});

describe('the value popover', () => {
    it('is a dialog named after the field, with focus inside; Escape returns to "+ Add Filter"', async () => {
        const { el, changes } = await mountBuilder();
        addBtn(el).focus();
        addBtn(el).click();
        await tick();
        const item = [...picker()!.querySelectorAll('button')].find(b => b.textContent === 'Category')!;
        item.focus();
        item.click();
        await tick();
        expect(valuePop()!.getAttribute('role')).toBe('dialog');
        expect(valuePop()!.getAttribute('aria-label')).toBe('Category');
        expect(valuePop()!.contains(document.activeElement)).toBe(true);
        key(document.activeElement!, 'Escape');
        await tick();
        expect(valuePop()).toBeNull();
        expect(document.activeElement).toBe(addBtn(el));
        expect(addBtn(el).getAttribute('aria-expanded')).toBe('false');
        expect(changes).toHaveLength(0);
    });

    it('Apply adds the chip, fires pdx-filter-change once with the filter, and focuses the chip', async () => {
        const { el, changes } = await mountBuilder();
        await addEnumFilter(el, 'Category', 'Books');
        expect(changes).toEqual([{ filters: [{ field: 'category', operator: 'in', value: ['Books'] }], logic: 'and' }]);
        const chips = el.querySelectorAll('.pdx-fb-chip');
        expect(chips).toHaveLength(1);
        expect(document.activeElement).toBe(chips[0].querySelector('.pdx-fb-chip-remove'));
    });
});

describe('removing a chip', () => {
    it('focus goes to the next chip, then to "+ Add Filter"', async () => {
        const { el } = await mountBuilder();
        await addEnumFilter(el, 'Category', 'Books');
        await addEnumFilter(el, 'City', 'Torino');
        let removes = el.querySelectorAll<HTMLButtonElement>('.pdx-fb-chip-remove');
        expect(removes).toHaveLength(2);
        removes[0].focus();
        removes[0].click();
        await tick();
        removes = el.querySelectorAll<HTMLButtonElement>('.pdx-fb-chip-remove');
        expect(removes).toHaveLength(1);
        expect(document.activeElement).toBe(removes[0]);
        removes[0].click();
        await tick();
        expect(document.activeElement).toBe(addBtn(el));
    });
});

// A chip's text as a <span> with a click listener would let a filter be removed from the keyboard
// but not changed. And a ✕ named only "Remove filter" on every chip would make two chips read the same.
describe('editing and naming a chip', () => {
    it('the chip label is a button named after the filter; it reopens the filter pre-filled, and Escape returns to it', async () => {
        const { el } = await mountBuilder();
        await addEnumFilter(el, 'Category', 'Books');
        const label = el.querySelector<HTMLElement>('.pdx-fb-chip-label')!;
        const text = label.textContent!;
        expect(text).toContain('Category');
        expect(text).toContain('Books');
        expect(label.tagName, 'the label is not a button: the filter cannot be edited from the keyboard').toBe('BUTTON');
        expect(label.getAttribute('type')).toBe('button');
        expect(label.getAttribute('aria-label')).toBe(`Edit filter: ${text}`);

        label.focus();
        label.click();   // Enter or Space on a native button
        await tick();
        expect(valuePop()?.getAttribute('aria-label')).toBe('Category');
        const books = [...valuePop()!.querySelectorAll('label')].find(l => l.textContent === 'Books')!;
        expect((books.querySelector('input') as HTMLInputElement).checked, 'the popover is not pre-filled').toBe(true);

        key(document.activeElement!, 'Escape');
        await tick();
        expect(valuePop()).toBeNull();
        expect(document.activeElement).toBe(el.querySelector('.pdx-fb-chip-label'));
    });

    it('each remove button is named after its chip', async () => {
        const { el } = await mountBuilder();
        await addEnumFilter(el, 'Category', 'Books');
        await addEnumFilter(el, 'City', 'Torino');
        const chips = [...el.querySelectorAll('.pdx-fb-chip')];
        expect(chips).toHaveLength(2);
        const names = chips.map(c => c.querySelector('.pdx-fb-chip-remove')!.getAttribute('aria-label'));
        const texts = chips.map(c => c.querySelector('.pdx-fb-chip-label')!.textContent);
        expect(names).toEqual(texts.map(t => `Remove filter: ${t}`));
        expect(new Set(names).size).toBe(2);
    });
});

describe("the data grid's header filter popover", () => {
    it('is a dialog named after the column; Escape closes it and returns focus to the funnel', async () => {
        const grid = document.createElement('pdx-data-grid') as HTMLElement & Record<string, unknown>;
        grid.columns = [{ field: 'name', header: 'Name' }];
        grid.data = [{ id: 1, name: 'Ada' }];
        document.body.appendChild(grid);
        await tick(40);
        const funnel = grid.querySelector('.pdx-dg-filter-icon') as HTMLButtonElement;
        funnel.focus();
        funnel.click();
        await tick();
        expect(valuePop()!.getAttribute('role')).toBe('dialog');
        expect(valuePop()!.getAttribute('aria-label')).toBe('Name');
        expect(valuePop()!.contains(document.activeElement)).toBe(true);
        key(document.activeElement!, 'Escape');
        await tick();
        expect(valuePop()).toBeNull();
        expect(document.activeElement).toBe(funnel);
    });
});
