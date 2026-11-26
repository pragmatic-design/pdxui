// Two menubars on a page keep to their own submenus.
//
// A submenu lives on <body>, and the menubar found its open one by key in the whole document:
// `document.querySelector('[data-submenu-key="more"]')`. Two menubars whose menus share a key (two
// editors, each with File › More) then reached each other's: closing the second removed the first's
// submenu and left its own on the page. The menubar now holds the submenu it opened.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/menubar/pdx-menubar.pdx';

type Bar = HTMLElement & { openMenu(key: string): void; closeMenu(reset?: boolean): void };

const items = (who: string) => [{
    key: 'file', label: 'File', children: [
        { key: 'more', type: 'submenu', label: 'More', children: [{ key: `${who}-rename`, label: `${who} rename` }] },
    ],
}];

async function bar(who: string): Promise<Bar> {
    const el = document.createElement('pdx-menubar') as Bar;
    document.body.appendChild(el);
    await tick(50);
    (el as unknown as { items: unknown[] }).items = items(who);
    await tick(50);
    return el;
}

/** Open `el`'s File menu and its More submenu. */
async function openMore(el: Bar): Promise<void> {
    el.openMenu('file');
    await tick(50);
    const panels = [...document.querySelectorAll<HTMLElement>('.pdx-menubar-panel')];
    (panels[panels.length - 1].querySelector('[data-menu-key="more"]') as HTMLElement).click();
    await tick(50);
}

/** Who each submenu on the page belongs to, read from its entry. */
const submenus = () => [...document.querySelectorAll('[data-submenu-key="more"]')]
    .map((s) => s.querySelector('[data-menu-key]')?.getAttribute('data-menu-key'));

describe('pdx-menubar: two on a page', () => {
    beforeEach(cleanup);

    it('closing one removes its own submenu, and leaves the other\'s', async () => {
        const a = await bar('a');
        const b = await bar('b');
        await openMore(a);
        await openMore(b);
        expect(submenus()).toEqual(['a-rename', 'b-rename']);

        b.closeMenu();
        await tick(50);
        expect(submenus(), 'the second menubar closed the first one\'s submenu').toEqual(['a-rename']);

        a.closeMenu();
        await tick(50);
        expect(submenus()).toEqual([]);
    });

    it('control — one menubar alone opens and closes its submenu', async () => {
        const a = await bar('a');
        await openMore(a);
        expect(submenus()).toEqual(['a-rename']);
        a.closeMenu();
        await tick(50);
        expect(submenus()).toEqual([]);
    });
});
