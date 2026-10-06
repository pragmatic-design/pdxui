// `<pdx-tree>` — the tree as a VIEW.
//
// `pdx-tree-select` is an INPUT: it opens a dropdown, is bound to a value, and closes when you pick.
// This is the folder pane, the category hierarchy, the navigable knowledge base — something that
// stays on the page and where selecting is a consequence of navigating rather than its purpose.
//
// Four of the five competitor libraries compared have the view as a first-class component, and the
// W3C `tree` pattern is not something a list can be composed into — which is why this exists.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../src/tree/pdx-tree';

const NODES = [
    {
        id: 'src', label: 'src', children: [
            { id: 'app', label: 'app.pdx' },
            { id: 'pages', label: 'pages', children: [{ id: 'home', label: 'home.pdx' }] },
        ],
    },
    { id: 'readme', label: 'README.md' },
];

async function mount(props: Record<string, unknown> = {}): Promise<HTMLElement> {
    document.body.innerHTML = '';
    const el = document.createElement('pdx-tree') as HTMLElement & Record<string, unknown>;
    el.nodes = NODES;
    for (const [k, v] of Object.entries(props)) el[k] = v;
    document.body.appendChild(el);
    await new Promise(r => requestAnimationFrame(() => r(null)));
    return el;
}

const items = (el: HTMLElement) => Array.from(el.querySelectorAll('[role="treeitem"]'));
const byLabel = (el: HTMLElement, text: string) =>
    items(el).find(i => i.querySelector('.pdx-tree-label')?.textContent?.trim() === text) as HTMLElement;

beforeEach(() => { document.body.innerHTML = ''; });

describe('the ARIA the pattern requires', () => {
    it('is a tree of treeitems, with the branches in groups', async () => {
        const el = await mount({ defaultExpandAll: true });
        expect(el.querySelector('[role="tree"]'), 'no tree role').not.toBeNull();
        expect(items(el).length, 'the nodes are not treeitems').toBe(5);
        expect(el.querySelectorAll('[role="group"]').length, 'the children are not in groups').toBe(2);
    });

    it('puts aria-expanded on the BRANCHES and on no leaf', async () => {
        // The pattern is explicit: a leaf must OMIT the attribute, not set it to false. A tree
        // where every node claims to be expandable reads as a tree of empty folders.
        const el = await mount({ defaultExpandAll: true });
        expect(byLabel(el, 'src').getAttribute('aria-expanded')).toBe('true');
        expect(byLabel(el, 'README.md').hasAttribute('aria-expanded'),
            'a leaf claims to be expandable').toBe(false);
    });

    it('carries level, position and set size — required when the DOM is not the whole tree', async () => {
        // Which is exactly our case: lazy branches and (later) virtualization.
        const el = await mount({ defaultExpandAll: true });
        const src = byLabel(el, 'src');
        expect(src.getAttribute('aria-level')).toBe('1');
        expect(src.getAttribute('aria-posinset')).toBe('1');
        expect(src.getAttribute('aria-setsize')).toBe('2');
        expect(byLabel(el, 'home.pdx').getAttribute('aria-level')).toBe('3');
    });

    it('says it is multi-selectable only when it is', async () => {
        const single = await mount({});
        expect(single.querySelector('[role="tree"]')!.hasAttribute('aria-multiselectable')).toBe(false);
        const multi = await mount({ selectionMode: 'multiple' });
        expect(multi.querySelector('[role="tree"]')!.getAttribute('aria-multiselectable')).toBe('true');
    });

    it('uses aria-selected OR aria-checked, never both', async () => {
        // The pattern forbids mixing them: a node that is both selected and checked says two
        // different things to a screen reader about one state.
        const selectable = await mount({ selectionMode: 'single', defaultExpandAll: true });
        byLabel(selectable, 'README.md').click();
        expect(byLabel(selectable, 'README.md').getAttribute('aria-selected')).toBe('true');
        expect(byLabel(selectable, 'README.md').hasAttribute('aria-checked')).toBe(false);

        const checkable = await mount({ checkable: true, defaultExpandAll: true });
        expect(byLabel(checkable, 'README.md').hasAttribute('aria-checked')).toBe(true);
        expect(byLabel(checkable, 'README.md').hasAttribute('aria-selected')).toBe(false);
    });

    it('costs one tab stop, not one per node', async () => {
        const el = await mount({ defaultExpandAll: true });
        const tabbable = items(el).filter(i => i.getAttribute('tabindex') === '0');
        expect(tabbable.length, 'a tree of 500 nodes would be 500 tab stops').toBe(1);
    });
});

describe('expanding', () => {
    it('starts collapsed, and a click on a branch opens it', async () => {
        const el = await mount({});
        expect(items(el).length, 'a collapsed tree rendered its children').toBe(2);

        byLabel(el, 'src').click();
        await new Promise(r => requestAnimationFrame(() => r(null)));
        expect(items(el).length).toBe(4);
        expect(byLabel(el, 'src').getAttribute('aria-expanded')).toBe('true');
    });

    it('emits pdx-expand with the node and the new state', async () => {
        const el = await mount({});
        const seen: unknown[] = [];
        el.addEventListener('pdx-expand', (e) => seen.push((e as CustomEvent).detail));
        byLabel(el, 'src').click();
        expect(seen).toEqual([{ id: 'src', expanded: true }]);
    });
});

describe('selection', () => {
    it('single: picking one unpicks the other', async () => {
        const el = await mount({ selectionMode: 'single', defaultExpandAll: true });
        byLabel(el, 'README.md').click();
        byLabel(el, 'app.pdx').click();
        const selected = items(el).filter(i => i.getAttribute('aria-selected') === 'true');
        expect(selected.length).toBe(1);
        expect(selected[0].textContent).toContain('app.pdx');
    });

    it('multiple: both stay, and the event carries every id', async () => {
        const el = await mount({ selectionMode: 'multiple', defaultExpandAll: true });
        const seen: unknown[] = [];
        el.addEventListener('pdx-select', (e) => seen.push((e as CustomEvent).detail));

        byLabel(el, 'README.md').click();
        byLabel(el, 'app.pdx').click();

        expect(items(el).filter(i => i.getAttribute('aria-selected') === 'true').length).toBe(2);
        expect(seen.at(-1)).toEqual({ selected: ['readme', 'app'] });
    });

    it('control — with selectionMode none, clicking selects nothing', async () => {
        const el = await mount({ defaultExpandAll: true });
        byLabel(el, 'README.md').click();
        expect(items(el).some(i => i.hasAttribute('aria-selected'))).toBe(false);
    });
});

describe('checkboxes, which is why a tree is not a list', () => {
    it('checking a branch checks its whole subtree', async () => {
        const el = await mount({ checkable: true, defaultExpandAll: true });
        (byLabel(el, 'src').querySelector('input[type="checkbox"]') as HTMLInputElement).click();

        for (const label of ['src', 'app.pdx', 'pages', 'home.pdx']) {
            expect(byLabel(el, label).getAttribute('aria-checked'), `${label} was not checked`).toBe('true');
        }
    });

    it('a partly checked branch is MIXED, not checked', async () => {
        // The tri-state. A parent that says "true" when one of its three children is checked is
        // lying to whoever reads it, and the checkbox in the DOM has to say so too.
        const el = await mount({ checkable: true, defaultExpandAll: true });
        (byLabel(el, 'app.pdx').querySelector('input[type="checkbox"]') as HTMLInputElement).click();

        expect(byLabel(el, 'src').getAttribute('aria-checked')).toBe('mixed');
        const box = byLabel(el, 'src').querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(box.indeterminate, 'the checkbox does not show the mixed state').toBe(true);
    });

    it('checking every child checks the parent', async () => {
        const el = await mount({ checkable: true, defaultExpandAll: true });
        (byLabel(el, 'home.pdx').querySelector('input[type="checkbox"]') as HTMLInputElement).click();
        expect(byLabel(el, 'pages').getAttribute('aria-checked'), 'the only child was checked').toBe('true');
    });

    it('emits pdx-check with the checked ids', async () => {
        const el = await mount({ checkable: true, defaultExpandAll: true });
        const seen: unknown[] = [];
        el.addEventListener('pdx-check', (e) => seen.push((e as CustomEvent).detail));
        (byLabel(el, 'app.pdx').querySelector('input[type="checkbox"]') as HTMLInputElement).click();
        expect(seen.at(-1)).toEqual({ checked: ['app'] });
    });
});

describe('lazy branches — the shape the library already has', () => {
    it('asks loadChildren once, and renders what it returns', async () => {
        const loadChildren = vi.fn(async () => [{ id: 'late', label: 'loaded.pdx' }]);
        document.body.innerHTML = '';
        const el = document.createElement('pdx-tree') as HTMLElement & Record<string, unknown>;
        el.nodes = [{ id: 'remote', label: 'remote', isBranch: true }];
        el.loadChildren = loadChildren;
        document.body.appendChild(el);
        await new Promise(r => requestAnimationFrame(() => r(null)));

        byLabel(el, 'remote').click();
        await vi.waitFor(() => expect(byLabel(el, 'loaded.pdx')).toBeTruthy());

        byLabel(el, 'remote').click();
        byLabel(el, 'remote').click();
        expect(loadChildren, 'the branch was fetched again on re-open').toHaveBeenCalledTimes(1);
    });

    it('a branch whose load fails stays askable, and says so', async () => {
        const loadChildren = vi.fn(async () => { throw new Error('offline'); });
        document.body.innerHTML = '';
        const el = document.createElement('pdx-tree') as HTMLElement & Record<string, unknown>;
        el.nodes = [{ id: 'remote', label: 'remote', isBranch: true }];
        el.loadChildren = loadChildren;
        const errors: unknown[] = [];
        el.addEventListener('pdx-load-error', (e) => errors.push((e as CustomEvent).detail));
        document.body.appendChild(el);
        await new Promise(r => requestAnimationFrame(() => r(null)));

        byLabel(el, 'remote').click();
        await vi.waitFor(() => expect(errors.length).toBe(1));

        // Askable again: a branch that swallowed its failure is a branch nobody can retry.
        expect(byLabel(el, 'remote').getAttribute('aria-expanded')).toBe('false');
        byLabel(el, 'remote').click();
        await vi.waitFor(() => expect(loadChildren).toHaveBeenCalledTimes(2));
    });
});

describe('the keyboard the pattern requires', () => {
    const key = (el: HTMLElement, k: string) =>
        el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

    it('down and up walk the VISIBLE nodes', async () => {
        const el = await mount({});
        const first = byLabel(el, 'src');
        first.focus();
        key(first, 'ArrowDown');
        expect(document.activeElement?.textContent).toContain('README.md');
        key(document.activeElement as HTMLElement, 'ArrowUp');
        expect(document.activeElement?.textContent).toContain('src');
    });

    it('right opens a branch, then walks into it; left closes it', async () => {
        const el = await mount({});
        const src = byLabel(el, 'src');
        src.focus();

        key(src, 'ArrowRight');
        expect(byLabel(el, 'src').getAttribute('aria-expanded'), 'Right did not open').toBe('true');
        key(byLabel(el, 'src'), 'ArrowRight');
        expect(document.activeElement?.textContent, 'Right on an open branch did not go in').toContain('app.pdx');

        key(document.activeElement as HTMLElement, 'ArrowLeft');
        expect(document.activeElement?.textContent, 'Left did not go back to the parent').toContain('src');
        key(document.activeElement as HTMLElement, 'ArrowLeft');
        expect(byLabel(el, 'src').getAttribute('aria-expanded')).toBe('false');
    });

    it('Home and End jump to the first and last visible node', async () => {
        const el = await mount({ defaultExpandAll: true });
        byLabel(el, 'app.pdx').focus();
        key(document.activeElement as HTMLElement, 'End');
        expect(document.activeElement?.textContent).toContain('README.md');
        key(document.activeElement as HTMLElement, 'Home');
        expect(document.activeElement?.textContent).toContain('src');
    });

    it('* expands every sibling at that depth', async () => {
        const el = await mount({});
        byLabel(el, 'src').focus();
        key(document.activeElement as HTMLElement, '*');
        expect(byLabel(el, 'src').getAttribute('aria-expanded')).toBe('true');
    });

    it('type-ahead moves to the node that starts with what was typed', async () => {
        const el = await mount({ defaultExpandAll: true });
        byLabel(el, 'src').focus();
        key(document.activeElement as HTMLElement, 'r');
        expect(document.activeElement?.textContent).toContain('README.md');
    });

    it('Enter selects', async () => {
        const el = await mount({ selectionMode: 'single', defaultExpandAll: true });
        const readme = byLabel(el, 'README.md');
        readme.focus();
        key(readme, 'Enter');
        expect(byLabel(el, 'README.md').getAttribute('aria-selected')).toBe('true');
    });

    it('Space checks, when there are checkboxes', async () => {
        // Asserted apart from Enter, and that is the pattern rather than a convenience: a
        // treeitem carries `aria-selected` OR `aria-checked`, never both, so a tree with
        // checkboxes expresses its state as CHECKED. Written as one test first, and it asked for
        // the two attributes on one node — which is exactly what the component refuses to do.
        const el = await mount({ selectionMode: 'single', checkable: true, defaultExpandAll: true });
        const readme = byLabel(el, 'README.md');
        readme.focus();
        key(readme, ' ');
        expect(byLabel(el, 'README.md').getAttribute('aria-checked')).toBe('true');
        expect(byLabel(el, 'README.md').hasAttribute('aria-selected')).toBe(false);
    });
});

describe('the fields are the application\'s, not ours', () => {
    it('reads id, label and children under the names the app uses', async () => {
        document.body.innerHTML = '';
        const el = document.createElement('pdx-tree') as HTMLElement & Record<string, unknown>;
        el.nodes = [{ key: 'a', name: 'Alpha', items: [{ key: 'b', name: 'Beta' }] }];
        el.idField = 'key';
        el.labelField = 'name';
        el.childrenField = 'items';
        el.defaultExpandAll = true;
        document.body.appendChild(el);
        await new Promise(r => requestAnimationFrame(() => r(null)));

        expect(byLabel(el, 'Alpha')).toBeTruthy();
        expect(byLabel(el, 'Beta')).toBeTruthy();
    });
});
