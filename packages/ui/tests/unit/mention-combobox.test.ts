// `<pdx-mention>`: the textarea is wired to its suggestion list, and the list's state is announced.
//
// While "Hello @al" shows a listbox with "Alice Johnson" highlighted, the textarea carries
// aria-autocomplete, aria-controls and aria-activedescendant; the number of suggestions is
// announced; and "@zzzz" does not close the list without a word.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/mention/pdx-mention';

const ITEMS = [
    { value: 'alice', label: 'Alice Johnson' },
    { value: 'albert', label: 'Albert Stone' },
    { value: 'bob', label: 'Bob Brown' },
];

async function mountMention(): Promise<{ el: HTMLElement; ta: HTMLTextAreaElement }> {
    document.body.innerHTML = '<pdx-mention label="Comment"></pdx-mention>';
    const el = document.body.firstElementChild as HTMLElement & { items: unknown };
    el.items = ITEMS;
    await tick(20);
    return { el, ta: el.querySelector('textarea') as HTMLTextAreaElement };
}

async function type(ta: HTMLTextAreaElement, text: string): Promise<void> {
    ta.focus();
    ta.value = text;
    ta.selectionStart = ta.selectionEnd = text.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(20);
}
function key(ta: HTMLTextAreaElement, k: string): void {
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}
const byIdref = (ta: Element, attr: string) => {
    const id = ta.getAttribute(attr);
    return id ? document.getElementById(id) : null;
};
const status = (el: Element) => el.querySelector('[role="status"]');

describe('pdx-mention textarea ↔ suggestion list', () => {
    beforeEach(cleanup);

    it('closed: autocomplete list, controls the listbox, no active descendant', async () => {
        const { ta } = await mountMention();
        expect(ta.getAttribute('aria-autocomplete')).toBe('list');
        expect(byIdref(ta, 'aria-controls')?.getAttribute('role')).toBe('listbox');
        expect(ta.hasAttribute('aria-activedescendant')).toBe(false);
    });

    it('"@al": the active descendant is the highlighted option', async () => {
        const { ta } = await mountMention();
        await type(ta, 'Hello @al');
        // No aria-expanded: the textbox role does not support it (axe aria-allowed-attr, critical).
        expect(ta.hasAttribute('aria-expanded')).toBe(false);
        const active = byIdref(ta, 'aria-activedescendant');
        expect(active?.getAttribute('role')).toBe('option');
        expect(active?.textContent).toContain('Alice Johnson');
        expect(active?.getAttribute('aria-selected')).toBe('true');
        expect(byIdref(ta, 'aria-controls')?.contains(active!)).toBe(true);
    });

    it('↓ moves the active descendant; Escape closes the list and clears it', async () => {
        const { el, ta } = await mountMention();
        await type(ta, 'Hello @al');
        key(ta, 'ArrowDown');
        await tick(10);
        expect(byIdref(ta, 'aria-activedescendant')?.textContent).toContain('Albert Stone');
        expect(status(el)?.textContent).toBe('2 suggestions');
        key(ta, 'Escape');
        await tick(10);
        expect(ta.hasAttribute('aria-activedescendant')).toBe(false);
        expect((byIdref(ta, 'aria-controls') as HTMLElement).style.display).toBe('none');
    });

    it('the number of suggestions is announced', async () => {
        const { el, ta } = await mountMention();
        await type(ta, 'Hello @al');
        expect(status(el)?.textContent).toBe('2 suggestions');
        await type(ta, 'Hello @ali');
        expect(status(el)?.textContent).toBe('1 suggestion');
    });

    it('no match: "No results", shown and announced', async () => {
        const { el, ta } = await mountMention();
        await type(ta, 'Hello @zzzz');
        expect(status(el)?.textContent).toBe('No results');
        const list = byIdref(ta, 'aria-controls') as HTMLElement;
        expect(list.style.display).not.toBe('none');
        expect(list.textContent).toContain('No results');
        expect(ta.hasAttribute('aria-activedescendant')).toBe(false);
    });

    it('closing clears the announcement', async () => {
        const { el, ta } = await mountMention();
        await type(ta, 'Hello @al');
        await type(ta, 'Hello ');
        expect(status(el)?.textContent).toBe('');
    });
});
