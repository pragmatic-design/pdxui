// pdx-tree-select is usable from the keyboard, and pdx-transfer's lists are one tab stop each.
//
// tree-select, once open, moves a highlight that aria-activedescendant announces, Enter picks it, and
// every branch carries a real aria-expanded; transfer makes each list one tab stop, keeps focus off
// <body> after a click, and names its search fields.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/tree-select/pdx-tree-select';
import '../../src/transfer/pdx-transfer';

beforeEach(cleanup);

const DEPARTMENTS = [
    { value: 'eng', label: 'Engineering', children: [{ value: 'fe', label: 'Frontend' }, { value: 'be', label: 'Backend' }] },
    { value: 'design', label: 'Design', children: [{ value: 'ux', label: 'UX' }] },
    { value: 'product', label: 'Product' },
];

function key(target: Element, k: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
}

async function treeSelect(attrs = ''): Promise<{ host: HTMLElement; trigger: HTMLElement }> {
    document.body.innerHTML = `<pdx-tree-select label="Department" ${attrs}></pdx-tree-select>`;
    const host = document.querySelector('pdx-tree-select') as HTMLElement;
    (host as unknown as { options: unknown[] }).options = DEPARTMENTS;
    await tick(30);
    await tick(30);
    const trigger = host.querySelector<HTMLElement>('[role="combobox"]')!;
    return { host, trigger };
}

/** The treeitem aria-activedescendant names, by its label. */
function active(owner: HTMLElement): string | null {
    const id = owner.getAttribute('aria-activedescendant');
    const el = id ? document.getElementById(id) : null;
    return el?.querySelector('.pdx-tree-node-label')?.textContent ?? null;
}

describe('pdx-tree-select: the APG tree, driven from the trigger', () => {
    it('Enter opens; ↓ highlights Engineering; → expands it; ↓ reaches Frontend; Enter selects it', async () => {
        const { host, trigger } = await treeSelect();
        trigger.focus();
        key(trigger, 'Enter');
        await tick(20);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        key(trigger, 'ArrowDown');
        await tick(20);
        expect(active(trigger)).toBe('Engineering');
        key(trigger, 'ArrowRight');
        await tick(20);
        key(trigger, 'ArrowDown');
        await tick(20);
        expect(active(trigger)).toBe('Frontend');
        key(trigger, 'Enter');
        await tick(20);
        expect((host as unknown as { value: unknown }).value).toBe('fe');
        expect(trigger.textContent).toContain('Frontend');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.hasAttribute('aria-activedescendant')).toBe(false);
    });

    it('← collapses an open branch, and from a child moves to its parent', async () => {
        const { trigger } = await treeSelect();
        key(trigger, 'ArrowDown');                 // opens on Engineering
        await tick(20);
        expect(active(trigger)).toBe('Engineering');
        key(trigger, 'ArrowRight');                // expand
        await tick(20);
        key(trigger, 'ArrowRight');                // into the first child
        await tick(20);
        expect(active(trigger)).toBe('Frontend');
        key(trigger, 'ArrowLeft');                 // to the parent
        await tick(20);
        expect(active(trigger)).toBe('Engineering');
        key(trigger, 'ArrowLeft');                 // collapse
        await tick(20);
        const eng = document.getElementById(trigger.getAttribute('aria-activedescendant')!)!;
        expect(eng.getAttribute('aria-expanded')).toBe('false');
    });

    it('End, Home and type-ahead move the highlight', async () => {
        const { trigger } = await treeSelect();
        key(trigger, 'ArrowDown');
        await tick(20);
        key(trigger, 'End');
        await tick(20);
        expect(active(trigger)).toBe('Product');
        key(trigger, 'Home');
        await tick(20);
        expect(active(trigger)).toBe('Engineering');
        key(trigger, 'd');
        await tick(20);
        expect(active(trigger)).toBe('Design');
    });

    it('aria-expanded is "true" or "false", never ""; items carry level, set size and position; the tree is named', async () => {
        const { host, trigger } = await treeSelect();
        key(trigger, 'Enter');
        await tick(20);
        const tree = host.querySelector('[role="tree"]')!;
        expect(tree.getAttribute('aria-label')).toBe('Department');
        const branches = [...host.querySelectorAll('[role="treeitem"][aria-expanded]')];
        expect(branches.length).toBe(2);
        for (const b of branches) expect(['true', 'false']).toContain(b.getAttribute('aria-expanded'));
        const product = [...host.querySelectorAll('[role="treeitem"]')].find(r => r.textContent?.includes('Product'))!;
        expect(product.getAttribute('aria-level')).toBe('1');
        expect(product.getAttribute('aria-setsize')).toBe('3');
        expect(product.getAttribute('aria-posinset')).toBe('3');
    });
});

async function transfer(attrs = ''): Promise<HTMLElement> {
    document.body.innerHTML = `<pdx-transfer ${attrs}></pdx-transfer>`;
    const host = document.querySelector('pdx-transfer') as HTMLElement;
    (host as unknown as { items: unknown[] }).items = ['Cat', 'Dog', 'Bird', 'Fish'].map(l => ({ value: l.toLowerCase(), label: l }));
    (host as unknown as { value: unknown[] }).value = ['fish'];
    await tick(30);
    await tick(30);
    return host;
}

describe('pdx-transfer: one tab stop per list', () => {
    it('each listbox has exactly one option in the tab order', async () => {
        const host = await transfer();
        const lists = [...host.querySelectorAll('[role="listbox"]')];
        expect(lists).toHaveLength(2);
        for (const list of lists) {
            expect(list.querySelectorAll('[role="option"][tabindex="0"]')).toHaveLength(1);
        }
        expect(lists[0].querySelectorAll('[role="option"][tabindex="-1"]')).toHaveLength(2);
    });

    it('↓ moves focus and the tab stop with it', async () => {
        const host = await transfer();
        const list = host.querySelector('[role="listbox"]')!;
        const first = list.querySelector<HTMLElement>('[role="option"]')!;
        first.focus();
        key(first, 'ArrowDown');
        const second = list.querySelectorAll<HTMLElement>('[role="option"]')[1];
        expect(document.activeElement).toBe(second);
        expect(second.getAttribute('tabindex')).toBe('0');
        expect(first.getAttribute('tabindex')).toBe('-1');
    });

    it('after a click that re-renders the list, focus is still on that option', async () => {
        const host = await transfer();
        const list = host.querySelector('[role="listbox"]')!;
        const dog = [...list.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.includes('Dog'))!;
        dog.focus();
        dog.click();
        await tick(20);
        const now = document.activeElement as HTMLElement;
        expect(now?.getAttribute('role'), 'focus fell out of the list').toBe('option');
        expect(now.textContent).toContain('Dog');
        expect(now.getAttribute('aria-selected')).toBe('true');
    });

    it('the search fields are named after their list', async () => {
        const host = await transfer('searchable source-title="Animals" target-title="Pets"');
        const inputs = [...host.querySelectorAll<HTMLInputElement>('.pdx-transfer-search input')];
        expect(inputs.map(i => i.getAttribute('aria-label'))).toEqual(['Search Animals', 'Search Pets']);
    });
});
