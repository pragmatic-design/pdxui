// pdx-drawer returns focus to the element that opened it.
//
// The drawer blurs its opener before the modal hides the background, so a focus trap created after
// that blur would record <body> as "previously focused", and closing would restore focus to <body>:
// Escape, a backdrop click and a Cancel inside the drawer would all leave the keyboard user at the
// top of the page.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/drawer/pdx-drawer';

type Drawer = HTMLElement & { open: boolean };

async function setup(): Promise<{ opener: HTMLButtonElement; drawer: Drawer; cancel: HTMLButtonElement }> {
    const opener = document.createElement('button');
    opener.textContent = 'Open drawer';
    document.body.appendChild(opener);
    const drawer = document.createElement('pdx-drawer') as Drawer;
    drawer.setAttribute('label', 'Demo drawer');
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    drawer.appendChild(cancel);
    document.body.appendChild(drawer);
    await tick(30);
    opener.addEventListener('click', () => { drawer.open = true; });
    cancel.addEventListener('click', () => { drawer.open = false; });
    return { opener, drawer, cancel };
}

async function openFrom(opener: HTMLButtonElement): Promise<void> {
    opener.focus();
    opener.click();
    await tick(50);
}

beforeEach(cleanup);

describe('pdx-drawer returns focus to its opener', () => {
    it('opening moves focus into the drawer (the control for the rest)', async () => {
        const { opener, drawer } = await setup();
        await openFrom(opener);
        expect(drawer.contains(document.activeElement) || document.querySelector('.pdx-drawer')!.contains(document.activeElement)).toBe(true);
    });

    it('after Escape', async () => {
        const { opener } = await setup();
        await openFrom(opener);
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick(50);
        expect(document.activeElement).toBe(opener);
    });

    it('after a backdrop click', async () => {
        const { opener } = await setup();
        await openFrom(opener);
        const backdrop = document.querySelector('.pdx-drawer-backdrop') as HTMLElement;
        const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        backdrop.dispatchEvent(down);
        expect(down.defaultPrevented, 'a mousedown on the backdrop must not move focus to the page').toBe(true);
        backdrop.click();
        await tick(50);
        expect(document.activeElement).toBe(opener);
    });

    it('after open = false from a Cancel button inside the drawer', async () => {
        const { opener, cancel } = await setup();
        await openFrom(opener);
        cancel.focus();
        cancel.click();
        await tick(50);
        expect(document.activeElement).toBe(opener);
    });

    it('not when focus had already gone elsewhere on the page', async () => {
        const { opener, drawer } = await setup();
        const elsewhere = document.createElement('input');
        document.body.appendChild(elsewhere);
        await openFrom(opener);
        drawer.open = false;
        elsewhere.focus();          // focus moved on before the close ran
        await tick(50);
        expect(document.activeElement).toBe(elsewhere);
    });
});
