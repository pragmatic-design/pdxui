// pdx-context-menu and pdx-split-button: an item chosen from the keyboard does what a click does.
//
// Both menus hand their items to focusGroup, which cancels Enter and Space. Without an onSelect it
// then calls nothing: Enter on "Cut" leaves the context menu open and emits nothing, and the same on
// the split button's "Save As..." — menus that open from the keyboard and cannot be used.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/context-menu/pdx-context-menu';
import '../../src/split-button/pdx-split-button';

const ITEMS = `[{"key":"cut","label":"Cut"},{"key":"copy","label":"Copy"}]`;

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

beforeEach(cleanup);

async function openContextMenu(): Promise<{ host: HTMLElement; area: HTMLElement; panel: HTMLElement; picks: string[] }> {
    document.body.innerHTML = `<pdx-context-menu items='${ITEMS}'><div id="area" tabindex="0">Right-click here</div></pdx-context-menu>`;
    await tick(30);
    const host = document.querySelector('pdx-context-menu') as HTMLElement;
    const area = document.getElementById('area')!;
    const picks: string[] = [];
    host.addEventListener('pdx-select', (e) => picks.push((e as CustomEvent<{ key: string }>).detail.key));
    area.focus();
    press(area, 'F10', { shiftKey: true });
    await tick(30);
    const panel = document.querySelector('.pdx-context-menu-panel') as HTMLElement;
    expect(panel.style.display, 'Shift+F10 did not open the menu').not.toBe('none');
    return { host, area, panel, picks };
}

describe('pdx-context-menu from the keyboard', () => {
    it('Enter on the focused item selects it and closes the menu', async () => {
        const { panel, picks } = await openContextMenu();
        const first = panel.querySelector<HTMLElement>('[role="menuitem"]')!;
        expect(document.activeElement, 'the menu opened without focusing its first item').toBe(first);

        press(first, 'Enter');
        expect(picks).toEqual(['cut']);
        expect(panel.style.display).toBe('none');
    });

    it('Space selects too', async () => {
        const { panel, picks } = await openContextMenu();
        press(panel.querySelector('[role="menuitem"]')!, ' ');
        expect(picks).toEqual(['cut']);
    });

    it('gives focus back to the element it was opened from', async () => {
        // Closing hides the focused item; left there, focus falls to <body> and the next Tab starts
        // from the top.
        const { area, panel } = await openContextMenu();
        press(panel.querySelector('[role="menuitem"]')!, 'Enter');
        expect(document.activeElement).toBe(area);
    });

    it('opens from the ContextMenu key as well as Shift+F10', async () => {
        document.body.innerHTML = `<pdx-context-menu items='${ITEMS}'><div id="area" tabindex="0">Area</div></pdx-context-menu>`;
        await tick(30);
        const area = document.getElementById('area')!;
        area.focus();
        press(area, 'ContextMenu');
        await tick(30);
        expect((document.querySelector('.pdx-context-menu-panel') as HTMLElement).style.display).not.toBe('none');
    });

    it('names its menu', async () => {
        const { panel } = await openContextMenu();
        expect(panel.getAttribute('role')).toBe('menu');
        expect(panel.getAttribute('aria-label')).toBe('Context menu');
    });
});

describe('pdx-split-button menu from the keyboard', () => {
    it('Enter on the focused item selects it, closes the menu and returns to the arrow', async () => {
        document.body.innerHTML = `<pdx-split-button label="Save" items='${ITEMS}'></pdx-split-button>`;
        await tick(30);
        const host = document.querySelector('pdx-split-button') as HTMLElement;
        const arrow = host.querySelector<HTMLButtonElement>('.pdx-split-arrow')!;
        const picks: string[] = [];
        host.addEventListener('pdx-select', (e) => picks.push((e as CustomEvent<{ key: string }>).detail.key));

        arrow.click();
        await tick(30);
        const first = document.querySelector<HTMLElement>('.pdx-split-button-panel [role="menuitem"]')!;
        expect(document.activeElement, 'the menu opened without focusing its first item').toBe(first);

        press(first, 'Enter');
        expect(picks).toEqual(['cut']);
        expect(document.querySelector('.pdx-split-button-panel')?.isConnected ?? false).toBe(false);
        expect(document.activeElement).toBe(arrow);
    });
});
