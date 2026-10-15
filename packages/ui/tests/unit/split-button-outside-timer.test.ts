// The outside-click listener of a split button's menu.
//
// It was attached 10ms after the menu opened, so the click that opened it would not close it. That
// timer outlived a split button left open when its test file ended, and fired after the environment
// was torn down: `document is not defined` (#382). The menu opens on a click, whose mousedown has
// already been dispatched, and the listener ignores a mousedown inside the split button: it is now
// attached when the menu opens, and nothing is left pending.
//
// A menu closed, or a split button destroyed, must not keep the listener on the document.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/split-button/pdx-split-button';

const items = [{ label: 'Edit', onClick() {} }];

async function mountSplitButton(): Promise<HTMLElement> {
    const el = document.createElement('pdx-split-button');
    (el as any).items = items;
    el.setAttribute('label', 'Save');
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const arrowOf = (el: HTMLElement): HTMLButtonElement => el.querySelector('.pdx-split-arrow') as HTMLButtonElement;

async function openSplitButton(): Promise<HTMLElement> {
    const el = await mountSplitButton();
    arrowOf(el).click();
    return el;
}

describe('split-button outside-click listener', () => {
    let net = 0;
    beforeEach(() => {
        cleanup();
        net = 0;
        const add = document.addEventListener.bind(document);
        const remove = document.removeEventListener.bind(document);
        vi.spyOn(document, 'addEventListener').mockImplementation((type: string, ...rest: any[]) => {
            if (type === 'mousedown') net++;
            return (add as any)(type, ...rest);
        });
        vi.spyOn(document, 'removeEventListener').mockImplementation((type: string, ...rest: any[]) => {
            if (type === 'mousedown') net--;
            return (remove as any)(type, ...rest);
        });
    });
    afterEach(() => vi.restoreAllMocks());

    it('opening the menu leaves no timer behind', async () => {
        const el = await mountSplitButton();
        const timeout = vi.spyOn(globalThis, 'setTimeout');
        arrowOf(el).click();
        expect(timeout, 'opening scheduled a timer, which can fire after the split button is gone').not.toHaveBeenCalled();
    });

    it('is attached when the menu opens, and an outside mousedown closes it at once', async () => {
        const el = await openSplitButton();
        expect(net, 'the listener is not on the document once the menu is open').toBe(1);
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(arrowOf(el).getAttribute('aria-expanded')).toBe('false');
        expect(net).toBe(0);
    });

    it('the mousedown and click that open the menu do not close it', async () => {
        const el = await mountSplitButton();
        const arrow = arrowOf(el);
        arrow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        arrow.click();
        arrow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(arrow.getAttribute('aria-expanded')).toBe('true');
    });

    it('is removed when the menu closes', async () => {
        await openSplitButton();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await tick(30);
        expect(net).toBe(0);
    });

    it('is removed when the split button is destroyed', async () => {
        const el = await openSplitButton();
        el.remove();
        await tick(30);
        expect(net).toBe(0);
    });
});
