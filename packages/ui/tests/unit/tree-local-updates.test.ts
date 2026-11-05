// Selecting or checking a node marks the rows on screen; it does not build the tree again (#904).
//
// `select()` and `setChecked()` both ended in `rebuild()`: every row of the tree thrown away and built
// again, for an `aria-selected` on two rows or an `aria-checked` up one path. The clicked row was
// gone, and the focus with it. Lookups by id and check states each walked the tree as well.

import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/tree/pdx-tree';

const NODES = [
    {
        id: 'src', label: 'src', children: [
            { id: 'app', label: 'app.pdx' },
            { id: 'pages', label: 'pages', children: [{ id: 'home', label: 'home.pdx' }, { id: 'about', label: 'about.pdx' }] },
        ],
    },
    { id: 'readme', label: 'README.md' },
];

async function mount(props: Record<string, unknown> = {}): Promise<HTMLElement> {
    document.body.innerHTML = '';
    const el = document.createElement('pdx-tree') as HTMLElement & Record<string, unknown>;
    el.nodes = NODES;
    el.defaultExpandAll = true;
    for (const [k, v] of Object.entries(props)) el[k] = v;
    document.body.appendChild(el);
    await new Promise(r => requestAnimationFrame(() => r(null)));
    return el;
}

const row = (el: HTMLElement, id: string) => el.querySelector(`[role="treeitem"][data-node-id="${id}"]`) as HTMLElement;
/** How many of the rows now on screen are the same elements as `before`, in the same places. */
const sameRows = (el: HTMLElement, before: Element[]) => {
    const now = Array.from(el.querySelectorAll('[role="treeitem"]'));
    return now.length === before.length && now.every((r, i) => r === before[i]);
};

beforeEach(() => { document.body.innerHTML = ''; });

describe('pdx-tree — local updates', () => {
    it('selecting a node keeps every row, and the clicked one keeps the focus', async () => {
        const el = await mount({ selectionMode: 'single' });
        const before = Array.from(el.querySelectorAll('[role="treeitem"]'));
        const home = row(el, 'home');
        home.focus();
        home.click();

        expect(sameRows(el, before), 'the rows were built again').toBe(true);
        expect(row(el, 'home')).toBe(home);
        expect(document.activeElement, 'the focus left the clicked row').toBe(home);
        expect(home.getAttribute('aria-selected')).toBe('true');

        row(el, 'readme').click();
        expect(home.getAttribute('aria-selected')).toBe('false');
        expect(row(el, 'readme').getAttribute('aria-selected')).toBe('true');
    });

    it('checking a leaf marks its ancestors on the rows already there', async () => {
        const el = await mount({ checkable: true });
        const before = Array.from(el.querySelectorAll('[role="treeitem"]'));
        (row(el, 'home').querySelector('[data-part="check"]') as HTMLElement).click();

        expect(sameRows(el, before), 'the rows were built again').toBe(true);
        expect(row(el, 'home').getAttribute('aria-checked')).toBe('true');
        expect(row(el, 'pages').getAttribute('aria-checked')).toBe('mixed');
        expect(row(el, 'src').getAttribute('aria-checked')).toBe('mixed');
        expect(row(el, 'readme').getAttribute('aria-checked')).toBe('false');
        const pagesBox = row(el, 'pages').querySelector('[data-part="check"]') as HTMLInputElement;
        expect(pagesBox.indeterminate).toBe(true);

        (row(el, 'about').querySelector('[data-part="check"]') as HTMLElement).click();
        expect(row(el, 'pages').getAttribute('aria-checked')).toBe('true');
        expect(pagesBox.checked).toBe(true);
        expect(pagesBox.indeterminate).toBe(false);
        expect(row(el, 'src').getAttribute('aria-checked')).toBe('mixed');
    });

    it('checking a branch checks its subtree, and the event names the fully checked ids', async () => {
        const el = await mount({ checkable: true });
        let last: string[] = [];
        el.addEventListener('pdx-check', (e) => { last = (e as CustomEvent<{ checked: string[] }>).detail.checked; });
        (row(el, 'pages').querySelector('[data-part="check"]') as HTMLElement).click();

        expect(['pages', 'home', 'about'].map(id => row(el, id).getAttribute('aria-checked'))).toEqual(['true', 'true', 'true']);
        expect(row(el, 'src').getAttribute('aria-checked')).toBe('mixed');
        expect([...last].sort()).toEqual(['about', 'home', 'pages']);
    });
});
