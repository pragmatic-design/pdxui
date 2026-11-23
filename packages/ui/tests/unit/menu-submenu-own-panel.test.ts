// A menu acts on its own submenu's panel, not on whatever panel of that key the page holds.
//
// A submenu's panel is drawn on <body>, outside the menu. Looked up there by its key — `[data-submenu-key=
// "more"]` — a menu found the first such panel in the page: another menu's, when two menus carry an
// entry of the same key (two rows' action menus, a dropdown beside a context menu). Closing its own
// submenu then removed the other's, and left its own on the page.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/menu/pdx-menu.pdx';

type Menu = HTMLElement & { closeSubmenu(): void };

const items = () => [
    { key: 'open', label: 'Open' },
    { key: 'more', type: 'submenu', label: 'More', children: [{ key: 'rename', label: 'Rename' }] },
];

async function mountMenu(): Promise<Menu> {
    const el = document.createElement('pdx-menu') as Menu;
    (el as unknown as { items: unknown }).items = items();
    el.setAttribute('open', '');
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const panels = () => [...document.querySelectorAll<HTMLElement>('[data-submenu-key="more"]')];
const openMore = async (menu: HTMLElement) => {
    (menu.querySelector('[data-menu-key="more"]') as HTMLElement).click();
    await tick(50);
};

beforeEach(cleanup);

describe('two menus whose submenus share a key', () => {
    it("closing one menu's submenu removes its own panel and leaves the other's", async () => {
        const first = await mountMenu();
        const second = await mountMenu();
        await openMore(first);
        const firstPanel = panels()[0];
        await openMore(second);
        const secondPanel = panels().find((p) => p !== firstPanel)!;
        expect(panels()).toHaveLength(2);

        second.closeSubmenu();
        expect(secondPanel.isConnected, "the second menu's own panel is still on the page").toBe(false);
        expect(firstPanel.isConnected, "the first menu's panel was removed by the second").toBe(true);
    });

    it('control — one menu closing its submenu removes it', async () => {
        const menu = await mountMenu();
        await openMore(menu);
        expect(panels()).toHaveLength(1);
        menu.closeSubmenu();
        expect(panels()).toHaveLength(0);
    });
});

describe('a menu whose items come after it mounts', () => {
    it('closes on Escape: its keys are bound when its first menu is built', async () => {
        const el = document.createElement('pdx-menu') as Menu & { items: unknown; open: boolean };
        el.setAttribute('open', '');
        document.body.appendChild(el);
        await tick(50);
        el.items = items();
        await tick(50);
        const entry = el.querySelector('[data-menu-key="open"]') as HTMLElement;
        entry.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick(50);
        expect(el.open, 'Escape reached no handler').toBe(false);
    });

    it('control — a menu with its items at mount closes on Escape', async () => {
        const el = await mountMenu() as Menu & { open: boolean };
        (el.querySelector('[data-menu-key="open"]') as HTMLElement)
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick(50);
        expect(el.open).toBe(false);
    });
});
