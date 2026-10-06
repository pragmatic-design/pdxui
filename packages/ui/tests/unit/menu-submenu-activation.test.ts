// A submenu item opens on Enter, Space and a click, not only on hover and ArrowRight.
//
// The menus' `focusGroup` turns Enter and Space into the item's click, so the three builders that
// draw submenus open the submenu on that click. Otherwise a keyboard user reaches «More ›» and
// nothing opens unless they know ArrowRight, and a tap reaches it only through the compat
// `mouseenter`. WAI-ARIA APG (menu): Enter and Space on an item with a submenu open it and focus its
// first item.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/menu/pdx-menu';
import '../../src/dropdown-menu/pdx-dropdown-menu';
import '../../src/menubar/pdx-menubar';

const items = () => [
    { key: 'open', label: 'Open' },
    { key: 'more', type: 'submenu', label: 'More', children: [
        { key: 'rename', label: 'Rename' },
        { key: 'move', label: 'Move' },
    ] },
];

/** The submenu, wherever its builder put it. */
const submenu = () => document.querySelector('[data-submenu-key="more"]') as HTMLElement | null;
const moreItem = () => document.querySelector('[data-menu-key="more"]') as HTMLElement;

/** Mount one builder with its menu open, and hand back the "More" item. */
type Mount = () => Promise<HTMLElement>;
const MOUNTS: Record<string, Mount> = {
    'pdx-menu': async () => {
        const el = document.createElement('pdx-menu');
        (el as any).items = items();
        el.setAttribute('open', '');
        document.body.appendChild(el);
        await tick(50);
        return moreItem();
    },
    'pdx-dropdown-menu': async () => {
        const el = document.createElement('pdx-dropdown-menu');
        el.setAttribute('label', 'Actions');
        (el as any).items = items();
        document.body.appendChild(el);
        await tick(50);
        (el as any).open();
        await tick(50);
        return moreItem();
    },
    'pdx-menubar': async () => {
        const bar = document.createElement('pdx-menubar');
        document.body.appendChild(bar);
        await tick(50);
        (bar as any).items = [{ key: 'file', label: 'File', children: items() }];
        await tick(50);
        (bar.querySelector('.pdx-menubar-trigger') as HTMLButtonElement).click();
        await tick(50);
        return moreItem();
    },
};

for (const [tag, mount] of Object.entries(MOUNTS)) {
    describe(`${tag}: a submenu item`, () => {
        beforeEach(cleanup);

        it('opens on a click, and says so', async () => {
            const more = await mount();
            more.click();
            await tick(50);
            expect(submenu(), 'a click on the submenu item opened nothing').not.toBeNull();
            expect(more.getAttribute('aria-expanded')).toBe('true');
        });

        for (const key of ['Enter', ' ']) {
            it(`opens on ${key === ' ' ? 'Space' : key}, with the focus on its first item`, async () => {
                const more = await mount();
                more.focus();
                more.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
                await tick(50);
                expect(submenu(), `${key === ' ' ? 'Space' : key} on the submenu item opened nothing`).not.toBeNull();
                expect((document.activeElement as HTMLElement | null)?.getAttribute('data-menu-key')).toBe('rename');
            });
        }

        it('control — a plain item is still activated by a click, and opens no submenu', async () => {
            await mount();
            const open = document.querySelector('[data-menu-key="open"]') as HTMLElement;
            open.click();
            await tick(50);
            expect(submenu()).toBeNull();
        });
    });
}
