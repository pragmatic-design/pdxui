// Menubar and submenu keyboard/pointer behaviour.
//
// A click on File does not close a menu the pointer has just opened; ArrowDown on a menubar item
// opens its menu; and ArrowLeft in a submenu closes it and leaves the top-level menu open. Every
// submenu is appended to <body>, outside the element whose keydown handler knows what ArrowLeft
// should do.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/menubar/pdx-menubar';
import '../../src/dropdown-menu/pdx-dropdown-menu';
import '../../src/menu/pdx-menu';

const FILE_ITEMS = [
    { key: 'new', label: 'New File' },
    { key: 'insert', label: 'Insert', type: 'submenu', children: [
        { key: 'rect', label: 'Rectangle' },
        { key: 'circle', label: 'Circle' },
    ] },
    { key: 'quit', label: 'Quit' },
];
const BAR = [
    { key: 'file', label: 'File', children: FILE_ITEMS },
    { key: 'edit', label: 'Edit', children: [{ key: 'undo', label: 'Undo' }] },
];

async function mountMenubar(trigger?: string): Promise<HTMLElement> {
    const el = document.createElement('pdx-menubar');
    if (trigger) el.setAttribute('trigger', trigger);
    (el as any).items = BAR;
    document.body.appendChild(el);
    await tick(30);
    return el;
}
const barItem = (el: Element, key: string) => el.querySelector(`[data-menubar-key="${key}"]`) as HTMLButtonElement;
const panel = () => document.querySelector('.pdx-menubar-panel') as HTMLElement | null;
const sub = (key: string) => document.querySelector(`[data-submenu-key="${key}"]`) as HTMLElement | null;
function key(target: Element, k: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
}
const pointerOn = (btn: Element) => btn.dispatchEvent(new MouseEvent('mouseenter'));

describe('pdx-menubar pointer', () => {
    beforeEach(() => { cleanup(); document.querySelectorAll('.pdx-menubar-panel, [data-submenu-key]').forEach(n => n.remove()); });

    // The default is `click`: a desktop menubar opens on a click and then follows the pointer. With
    // `hover` the bar opens a menu the moment the pointer crosses it on the way somewhere else.
    it('by default the pointer alone opens nothing; a click opens, and then hover switches menus', async () => {
        const el = await mountMenubar();
        const file = barItem(el, 'file');
        const edit = barItem(el, 'edit');

        pointerOn(file);
        expect(file.getAttribute('aria-expanded'), 'the pointer alone opened a menu').toBe('false');
        expect(panel()).toBeNull();

        file.click();
        expect(file.getAttribute('aria-expanded')).toBe('true');

        // With one open, the pointer moves between menus, as a desktop menubar does.
        pointerOn(edit);
        expect(edit.getAttribute('aria-expanded')).toBe('true');
        expect(file.getAttribute('aria-expanded')).toBe('false');

        // Closed again, the pointer opens nothing.
        edit.click();
        expect(edit.getAttribute('aria-expanded')).toBe('false');
        pointerOn(file);
        expect(file.getAttribute('aria-expanded')).toBe('false');
    });

    it('hover then click on the same item keeps the menu the hover opened', async () => {
        const el = await mountMenubar('hover');
        const file = barItem(el, 'file');
        pointerOn(file);
        expect(file.getAttribute('aria-expanded')).toBe('true');
        file.click();
        expect(file.getAttribute('aria-expanded')).toBe('true');
        expect(panel()).not.toBeNull();
        // A second click, on a menu that was already open, closes it.
        file.click();
        expect(file.getAttribute('aria-expanded')).toBe('false');
    });

    it('trigger="hover": a click on a menu that was open before the pointer arrived closes it', async () => {
        const el = await mountMenubar('hover');
        const file = barItem(el, 'file');
        pointerOn(file);
        file.dispatchEvent(new MouseEvent('mouseleave'));
        pointerOn(file);
        file.click();
        expect(file.getAttribute('aria-expanded')).toBe('false');
    });

    it('trigger="click": a click opens, a second closes', async () => {
        const el = await mountMenubar('click');
        const file = barItem(el, 'file');
        pointerOn(file);
        expect(file.getAttribute('aria-expanded')).toBe('false');
        file.click();
        expect(file.getAttribute('aria-expanded')).toBe('true');
        file.click();
        expect(file.getAttribute('aria-expanded')).toBe('false');
    });
});

describe('pdx-menubar keyboard', () => {
    beforeEach(() => { cleanup(); document.querySelectorAll('.pdx-menubar-panel, [data-submenu-key]').forEach(n => n.remove()); });

    it('ArrowDown on an item opens its menu with focus on the first entry', async () => {
        const el = await mountMenubar();
        const file = barItem(el, 'file');
        file.focus();
        expect(key(file, 'ArrowDown').defaultPrevented).toBe(true);
        await tick(30);
        expect(file.getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement?.textContent).toContain('New File');
    });

    it('ArrowUp on an item opens its menu with focus on the last entry', async () => {
        const el = await mountMenubar();
        const file = barItem(el, 'file');
        file.focus();
        key(file, 'ArrowUp');
        await tick(30);
        expect(document.activeElement?.textContent).toContain('Quit');
    });

    it('ArrowLeft in a submenu closes it and returns to its item', async () => {
        const el = await mountMenubar();
        const file = barItem(el, 'file');
        file.focus();
        key(file, 'ArrowDown');
        await tick(30);
        const insert = panel()!.querySelector('[data-menu-key="insert"]') as HTMLElement;
        insert.focus();
        key(insert, 'ArrowRight');
        await tick(30);
        expect(document.activeElement?.textContent).toContain('Rectangle');
        key(document.activeElement!, 'ArrowLeft');
        await tick(10);
        expect(sub('insert')).toBeNull();
        expect(document.activeElement).toBe(insert);
        expect(insert.getAttribute('aria-expanded')).toBe('false');
        // The top-level menu stays open.
        expect(file.getAttribute('aria-expanded')).toBe('true');
    });
});

describe('pdx-menu opened after mount', () => {
    beforeEach(() => { cleanup(); document.querySelectorAll('[data-submenu-key]').forEach(n => n.remove()); });

    it('keeps its arrow keys and Escape across open → closed → open', async () => {
        const el = document.createElement('pdx-menu') as HTMLElement & { open: boolean };
        (el as any).items = FILE_ITEMS;
        document.body.appendChild(el);
        await tick(30);
        const closes: number[] = [];
        el.addEventListener('pdx-close', () => closes.push(1));

        for (let round = 0; round < 2; round++) {
            el.open = true;
            await tick(30);
            const first = el.querySelector('[data-menu-key="new"]') as HTMLElement;
            expect(document.activeElement).toBe(first);
            // Toggling `open` must not run a cleanup that disposes the arrow keys and the
            // Escape/ArrowRight handler: then after the first open nothing moves.
            key(first, 'ArrowDown');
            expect(document.activeElement?.textContent).toContain('Insert');
            key(document.activeElement!, 'Escape');
            expect(closes.length).toBe(round + 1);
            el.open = false;
            await tick(30);
        }
    });
});

describe('ArrowLeft in a submenu, pdx-dropdown-menu and pdx-menu', () => {
    beforeEach(() => { cleanup(); document.querySelectorAll('.pdx-dropdown-menu-panel, [data-submenu-key]').forEach(n => n.remove()); });

    it('pdx-dropdown-menu', async () => {
        const el = document.createElement('pdx-dropdown-menu');
        el.setAttribute('label', 'Insert');
        (el as any).items = FILE_ITEMS;
        document.body.appendChild(el);
        await tick(30);
        const trig = el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
        trig.click();
        await tick(30);
        const insert = document.querySelector('.pdx-dropdown-menu-panel [data-menu-key="insert"]') as HTMLElement;
        insert.focus();
        key(insert, 'ArrowRight');
        await tick(30);
        expect(document.activeElement?.textContent).toContain('Rectangle');
        key(document.activeElement!, 'ArrowLeft');
        await tick(10);
        expect(sub('insert')).toBeNull();
        expect(document.activeElement).toBe(insert);
    });

    it('pdx-menu', async () => {
        const el = document.createElement('pdx-menu');
        el.setAttribute('open', '');
        (el as any).items = FILE_ITEMS;
        document.body.appendChild(el);
        await tick(30);
        const insert = el.querySelector('[data-menu-key="insert"]') as HTMLElement;
        insert.focus();
        key(insert, 'ArrowRight');
        await tick(30);
        expect(document.activeElement?.textContent).toContain('Rectangle');
        key(document.activeElement!, 'ArrowLeft');
        await tick(10);
        expect(sub('insert')).toBeNull();
        expect(document.activeElement).toBe(insert);
    });
});

describe('a pdx-menu redrawn under its open submenu', () => {
    // A menu that is a `$derived` over `$t` is drawn again when a dictionary lands while a submenu is
    // open. The submenu's Escape must not give the focus to the item it opened from — detached by
    // then, so the focus goes nowhere and the next Escape is nobody's.
    beforeEach(() => { cleanup(); document.querySelectorAll('[data-submenu-key]').forEach(n => n.remove()); });

    for (const k of ['Escape', 'ArrowLeft']) {
        it(`${k} gives the focus to the item as the menu is NOW`, async () => {
            const el = document.createElement('pdx-menu');
            el.setAttribute('open', '');
            (el as any).items = FILE_ITEMS;
            document.body.appendChild(el);
            await tick(30);
            const before = el.querySelector('[data-menu-key="insert"]') as HTMLElement;
            before.focus();
            key(before, 'ArrowRight');
            await tick(30);
            expect(document.activeElement?.textContent).toContain('Rectangle');

            // A change of SHAPE, so the menu is drawn again: a copy of the same
            // items — a dictionary landing, which changes labels only — is updated in place and
            // keeps its elements (menu-update-in-place.test.ts). A redraw still happens for a new
            // entry, and this is its focus rule.
            (el as any).items = [...FILE_ITEMS.map(i => ({ ...i })), { key: 'extra', label: 'Extra' }];
            await tick(30);
            const now = el.querySelector('[data-menu-key="insert"]') as HTMLElement;
            expect(now, 'the premise: the menu was drawn again').not.toBe(before);

            key(document.activeElement!, k);
            await tick(10);
            expect(sub('insert')).toBeNull();
            expect(document.activeElement, 'the focus went to the detached item, i.e. nowhere').toBe(now);
        });
    }
});
