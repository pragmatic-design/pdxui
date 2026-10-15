// pdx-rich-text's `heading` and `list` toolbar items are menu buttons (#417).
//
// Both declare `type: 'dropdown'` and their children. The toolbar drew each as a plain button that
// ran its own command: `heading` always made an H1, `list` always a bullet list, so the `standard`
// and `full` presets could not make an H2, an H3, an ordered list or a task list. The unit test that
// counted buttons could not see it: a dropdown drawn as a button counts as one.
import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/rich-text/pdx-rich-text';

const settle = (ms = 100): Promise<void> => new Promise(r => setTimeout(r, ms));

type Editor = HTMLElement & { setHTML(markup: string): void; getHTML(): string };

async function mountEditor(): Promise<Editor> {
    const el = document.createElement('pdx-rich-text') as Editor;
    el.setAttribute('toolbar', 'full');
    document.body.appendChild(el);
    await settle();
    el.setHTML('<p>Title</p>');
    await settle();
    return el;
}

/** The toolbar's menu button named `name`. */
function trigger(el: HTMLElement, name: string): HTMLButtonElement {
    const found = Array.from(el.querySelectorAll<HTMLButtonElement>('.pdx-rt-toolbar-btn[aria-haspopup="menu"]'))
        .find(b => b.getAttribute('aria-label') === name);
    expect(found, `no menu button named ${name} in the toolbar`).toBeTruthy();
    return found!;
}

/** A mouse click: the toolbar acts on mousedown, so the focus stays in the editor. */
function mouseClick(target: Element): void {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
}

const openMenu = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="menu"]');

describe('pdx-rich-text toolbar — heading and list are menu buttons', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('the heading menu offers H1–H3 with their icons drawn, and H2 makes a level-2 heading', async () => {
        const el = await mountEditor();
        const button = trigger(el, 'Heading');
        expect(button.getAttribute('aria-expanded')).toBe('false');

        mouseClick(button);
        await settle();
        const menu = openMenu();
        expect(menu, 'the heading item opened no menu').toBeTruthy();
        expect(button.getAttribute('aria-expanded')).toBe('true');
        const items = Array.from(menu!.querySelectorAll<HTMLElement>('[role="menuitem"]'));
        expect(items.map(i => i.querySelector('pdx-icon')?.getAttribute('name'))).toEqual(['heading-1', 'heading-2', 'heading-3']);
        expect(items.filter(i => !i.querySelector('pdx-icon svg')).length, 'menu items drawn with an empty icon').toBe(0);
        expect(items.every(i => (i.textContent ?? '').trim() !== ''), 'a menu item with no name').toBe(true);

        mouseClick(items[1]);
        await settle();
        expect(openMenu(), 'choosing an item leaves the menu open').toBeNull();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(el.getHTML()).toMatch(/<h2[^>]*>Title<\/h2>/);
    });

    it('the list menu offers bullet, ordered and task, and "ordered" makes an ordered list', async () => {
        const el = await mountEditor();
        mouseClick(trigger(el, 'List'));
        await settle();
        const items = Array.from(openMenu()!.querySelectorAll<HTMLElement>('[role="menuitem"]'));
        expect(items.map(i => i.querySelector('pdx-icon')?.getAttribute('name'))).toEqual(['list', 'list-ordered', 'list-checks']);

        mouseClick(items[1]);
        await settle();
        expect(el.getHTML()).toMatch(/<ol[^>]*>/);
    });

    it('the control: a plain button still runs its command with no menu', async () => {
        const el = await mountEditor();
        const quote = el.querySelector('.pdx-rt-toolbar-btn[data-command="toggleBlockquote"]')!;
        expect(quote.hasAttribute('aria-haspopup')).toBe(false);
        mouseClick(quote);
        await settle();
        expect(openMenu()).toBeNull();
        expect(el.getHTML()).toMatch(/<blockquote/);
    });
});
