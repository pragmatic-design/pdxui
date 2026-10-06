// `<pdx-inline-edit>` keeps the keyboard user's place, and closes when focus leaves it.
//
// Enter (save) and Escape (cancel) must not leave focus on <body>; Tab out of the editor must not
// leave it open, or two can be open at once; and each editor is named after the field it edits, not
// "Edit value".
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';

import '../../src/inline-edit/pdx-inline-edit';
import '../../src/number-input/pdx-number-input';

type InlineEdit = HTMLElement & { value: unknown };

async function mountEdit(value: unknown, attrs: Record<string, string> = {}): Promise<InlineEdit> {
    const el = await mount<InlineEdit>('pdx-inline-edit', attrs);
    el.value = value;
    await tick(50);
    return el;
}
const display = (el: Element) => el.querySelector('.pdx-inline-edit-display') as HTMLElement;
const input = (el: Element) => el.querySelector('input.pdx-inline-edit-input') as HTMLInputElement | null;

function key(target: Element, k: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

/** Enter on the display: the editor's input has focus at once, before anything else can be typed. */
async function openWithEnter(el: InlineEdit): Promise<HTMLInputElement> {
    display(el).focus();
    key(display(el), 'Enter');
    const inp = input(el)!;
    expect(document.activeElement).toBe(inp);
    return inp;
}

describe('pdx-inline-edit focus', () => {
    beforeEach(cleanup);

    it('Enter saves and focus goes back to the display button', async () => {
        const el = await mountEdit('John Doe');
        const inp = await openWithEnter(el);
        inp.value = 'Jane Roe';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        key(inp, 'Enter');
        await tick(20);
        expect(el.querySelector('.pdx-inline-edit-display .pdx-inline-edit-text')?.textContent).toBe('Jane Roe');
        expect(el.value).toBe('Jane Roe');
        expect(document.activeElement).toBe(display(el));
    });

    it('Escape cancels and focus goes back to the display button', async () => {
        const el = await mountEdit('John Doe');
        const inp = await openWithEnter(el);
        inp.value = 'discarded';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        key(inp, 'Escape');
        await tick(20);
        expect(el.querySelector('.pdx-inline-edit-display .pdx-inline-edit-text')?.textContent).toBe('John Doe');
        expect(document.activeElement).toBe(display(el));
    });

    it('focus leaving the editor commits it and closes it, without pulling focus back', async () => {
        const el = await mountEdit('John Doe');
        const next = document.createElement('button');
        document.body.appendChild(next);
        const changes: unknown[] = [];
        el.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail.value));

        const inp = await openWithEnter(el);
        inp.value = 'Tabbed away';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        next.focus();
        await tick(20);

        expect(input(el)).toBeNull();
        expect(el.querySelector('.pdx-inline-edit')?.classList.contains('editing')).toBe(false);
        expect(el.querySelector('.pdx-inline-edit-display .pdx-inline-edit-text')?.textContent).toBe('Tabbed away');
        expect(changes).toEqual(['Tabbed away']);
        expect(document.activeElement).toBe(next);
        next.remove();
    });

    it('with save-on="action", focus leaving the editor neither saves nor closes it', async () => {
        const el = await mountEdit('Project Alpha', { saveon: 'action' });
        const next = document.createElement('button');
        document.body.appendChild(next);
        const inp = await openWithEnter(el);
        inp.value = 'not yet';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        next.focus();
        await tick(20);
        expect(input(el)).not.toBeNull();
        expect(el.value).toBe('Project Alpha');
        next.remove();
    });

    it('the number editor takes focus at once, and Escape returns it to the display', async () => {
        const el = await mountEdit(42, { type: 'number' });
        display(el).focus();
        key(display(el), 'Enter');
        const inner = el.querySelector('pdx-number-input input') as HTMLInputElement;
        expect(document.activeElement).toBe(inner);
        key(inner, 'Escape');
        await tick(20);
        expect(document.activeElement).toBe(display(el));
    });

    it('the Save button of save-on="action" returns focus to the display', async () => {
        const el = await mountEdit('Project Alpha', { saveon: 'action' });
        const inp = await openWithEnter(el);
        inp.value = 'Project Beta';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        const save = el.querySelector('.pdx-inline-edit-save') as HTMLButtonElement;
        save.focus();
        save.click();
        await tick(20);
        expect(el.querySelector('.pdx-inline-edit-display .pdx-inline-edit-text')?.textContent).toBe('Project Beta');
        expect(document.activeElement).toBe(display(el));
    });
});

describe('pdx-inline-edit names', () => {
    beforeEach(cleanup);

    it('the editor is named after the value it edits', async () => {
        const el = await mountEdit('John Doe');
        const inp = await openWithEnter(el);
        expect(inp.getAttribute('aria-label')).toBe('Edit John Doe');
    });

    it('the label prop names the editor', async () => {
        const el = await mountEdit('John Doe', { label: 'Name' });
        const inp = await openWithEnter(el);
        expect(inp.getAttribute('aria-label')).toBe('Name');
    });

    it('the pencil is not part of the display button\'s name', async () => {
        const el = await mountEdit('John Doe');
        const icon = el.querySelector('.pdx-inline-edit-icon');
        expect(icon?.getAttribute('aria-hidden')).toBe('true');
    });
});
