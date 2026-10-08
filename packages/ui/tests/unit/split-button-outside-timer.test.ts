// The outside-click listener is attached 10ms after the menu opens, so the click that opened it
// does not close it. A menu closed — or a split button destroyed — inside those 10ms must not get
// the listener anyway: it would stay on the document with nothing to remove it, and a test
// environment torn down in the meantime throws `document is not defined` when the timer fires.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/split-button/pdx-split-button';

const items = [{ label: 'Edit', onClick() {} }];

async function openSplitButton(): Promise<HTMLElement> {
    const el = document.createElement('pdx-split-button');
    (el as any).items = items;
    el.setAttribute('label', 'Save');
    document.body.appendChild(el);
    await tick(50);
    (el.querySelector('.pdx-split-arrow') as HTMLButtonElement).click();
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

    it('is not attached when the menu closes before it would be', async () => {
        await openSplitButton();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await tick(30);
        expect(net).toBe(0);
    });

    it('is not attached when the split button is destroyed before it would be', async () => {
        const el = await openSplitButton();
        el.remove();
        await tick(30);
        expect(net).toBe(0);
    });
});
