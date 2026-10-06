// A submenu closed by the pointer leaving it gives the focus back to its item.
//
// The pointer leaving a submenu schedules its close (150 ms). A close that removes the panel and
// moves no focus drops a focus that was on one of its items — a radio just clicked, an item reached
// with the arrows — to <body>, and the menu's keys (Escape included) reach nobody: under load the
// showcase's profile menu stays open after two Escapes.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/menu/pdx-menu';
import '../../src/menubar/pdx-menubar';

const items = () => [
    { key: 'open', label: 'Open' },
    { key: 'more', type: 'submenu', label: 'More', children: [
        { key: 'rename', label: 'Rename' },
        { key: 'move', label: 'Move' },
    ] },
];

const submenu = () => document.querySelector('[data-submenu-key="more"]') as HTMLElement | null;
const moreItem = () => document.querySelector('[data-menu-key="more"]') as HTMLElement;

type Mount = () => Promise<void>;
const MOUNTS: Record<string, Mount> = {
    'pdx-menu': async () => {
        const el = document.createElement('pdx-menu');
        (el as any).items = items();
        el.setAttribute('open', '');
        document.body.appendChild(el);
        await tick(50);
    },
    'pdx-menubar': async () => {
        const bar = document.createElement('pdx-menubar');
        document.body.appendChild(bar);
        await tick(50);
        (bar as any).items = [{ key: 'file', label: 'File', children: items() }];
        await tick(50);
        (bar.querySelector('.pdx-menubar-trigger') as HTMLButtonElement).click();
        await tick(50);
    },
};

describe('pdx-menu: items set again while it is open', () => {
    beforeEach(cleanup);

    // An app can set a menu's items again shortly after load: the menu is rebuilt, and the item
    // holding the focus goes with the old one — the focus would fall to <body> and the next Escape
    // reach nobody. A rebuild keeps the focus on the item of the same key.
    it('keeps the focus on the item of the same key', async () => {
        await MOUNTS['pdx-menu']();
        const host = document.querySelector('pdx-menu') as HTMLElement & { items: unknown };
        (document.querySelector('[data-menu-key="more"]') as HTMLElement).focus();
        host.items = items();                      // a new array: the menu is drawn again
        await tick(50);
        const now = document.querySelector('[data-menu-key="more"]') as HTMLElement;
        expect(document.activeElement, 'the rebuild dropped the focus to <body>').not.toBe(document.body);
        expect(document.activeElement).toBe(now);
    });

    it('control — with the focus outside the menu, a rebuild does not take it', async () => {
        await MOUNTS['pdx-menu']();
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.focus();
        (document.querySelector('pdx-menu') as HTMLElement & { items: unknown }).items = items();
        await tick(50);
        expect(document.activeElement).toBe(outside);
    });
});

for (const [tag, mount] of Object.entries(MOUNTS)) {
    describe(`${tag}: a submenu the pointer leaves`, () => {
        beforeEach(cleanup);

        it('gives the focus back to its item, not to <body>', async () => {
            await mount();
            const more = moreItem();
            more.focus();
            more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            await tick(50);
            const sub = submenu();
            expect(sub, 'the submenu did not open').not.toBeNull();
            expect((document.activeElement as HTMLElement | null)?.getAttribute('data-menu-key')).toBe('rename');

            sub!.dispatchEvent(new MouseEvent('mouseleave'));
            await tick(250);
            expect(submenu(), 'the pointer left and the submenu stayed').toBeNull();
            expect(document.activeElement, 'the focus fell to <body>').not.toBe(document.body);
            expect((document.activeElement as HTMLElement | null)?.getAttribute('data-menu-key')).toBe('more');
        });

        it('control — with the focus elsewhere, closing it does not steal the focus', async () => {
            await mount();
            const outside = document.createElement('button');
            outside.textContent = 'Elsewhere';
            document.body.appendChild(outside);
            moreItem().click();
            await tick(50);
            outside.focus();
            submenu()!.dispatchEvent(new MouseEvent('mouseleave'));
            await tick(250);
            expect(submenu()).toBeNull();
            expect(document.activeElement, 'closing a submenu took the focus from elsewhere').toBe(outside);
        });
    });
}
