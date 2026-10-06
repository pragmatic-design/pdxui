// pdx-split-button's arrow says whether its menu is open.
//
// aria-expanded follows the open state through open() and close() too, not only the prop-change
// branch: read with `_open.peek()`, which never subscribes, the attribute would be left alone and a
// screen reader would announce an open menu as closed.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/split-button/pdx-split-button';

async function mountSplit(): Promise<{ el: HTMLElement; arrow: HTMLButtonElement }> {
    document.body.innerHTML = `<pdx-split-button label="Save" items='[{"key":"draft","label":"Draft"},{"key":"copy","label":"Copy"}]'></pdx-split-button>`;
    await tick(30);
    const el = document.querySelector('pdx-split-button') as HTMLElement;
    const arrow = el.querySelector<HTMLButtonElement>('.pdx-split-arrow')!;
    expect(arrow, 'the split button built no arrow').toBeTruthy();
    return { el, arrow };
}

const panelOpen = (): boolean => !!document.querySelector('.pdx-split-button-panel[role="menu"]')?.isConnected;

beforeEach(cleanup);

describe('pdx-split-button aria-expanded', () => {
    it('is false at rest', async () => {
        const { arrow } = await mountSplit();
        expect(arrow.getAttribute('aria-expanded')).toBe('false');
    });

    it('is true while the menu is open, and false again after Escape', async () => {
        const { arrow } = await mountSplit();
        arrow.click();
        await tick(30);
        expect(panelOpen(), 'the click did not open the menu').toBe(true);
        expect(arrow.getAttribute('aria-expanded'), 'an open menu announced as closed').toBe('true');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick(30);
        expect(panelOpen()).toBe(false);
        expect(arrow.getAttribute('aria-expanded')).toBe('false');
    });

    it('goes back to false when a click outside closes the menu', async () => {
        const { arrow } = await mountSplit();
        arrow.click();
        await tick(30); // the outside listener is installed a few ms after opening
        expect(arrow.getAttribute('aria-expanded')).toBe('true');
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await tick(30);
        expect(panelOpen()).toBe(false);
        expect(arrow.getAttribute('aria-expanded')).toBe('false');
    });
});
