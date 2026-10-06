// The grid knows whether the pointer or the keyboard used it last — and a lone modifier is neither.
import { describe, it, expect, afterEach } from 'vitest';
import { trackInputModality, POINTER_ATTR } from '../../src/data-grid/grid-input-modality';

const key = (target: EventTarget, k: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

function setup(): { grid: HTMLElement; outside: HTMLElement; stop: () => void } {
    document.body.innerHTML = '<button id="outside">Before</button><div id="grid"><div id="cell" tabindex="0"></div></div>';
    const grid = document.getElementById('grid')!;
    const stop = trackInputModality(grid);
    grid.querySelector('#cell')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return { grid, outside: document.getElementById('outside')!, stop };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('grid input modality', () => {
    it('a pointer inside the grid marks it', () => {
        const { grid, stop } = setup();
        expect(grid.hasAttribute(POINTER_ATTR)).toBe(true);
        stop();
    });

    it('a lone modifier — the Shift of a multi-sort — keeps the mark', () => {
        const { grid, stop } = setup();
        for (const k of ['Shift', 'Control', 'Alt', 'Meta']) key(grid.querySelector('#cell')!, k);
        expect(grid.hasAttribute(POINTER_ATTR), 'a modifier counted as keyboard use').toBe(true);
        stop();
    });

    it('a real key inside the grid takes it off', () => {
        const { grid, stop } = setup();
        key(grid.querySelector('#cell')!, 'ArrowRight');
        expect(grid.hasAttribute(POINTER_ATTR)).toBe(false);
        stop();
    });

    it('so does a key pressed OUTSIDE the grid: the Tab that brings the focus back in', () => {
        const { grid, outside, stop } = setup();
        key(outside, 'Tab');
        expect(grid.hasAttribute(POINTER_ATTR), 'a Tab pressed outside left the ring suppressed').toBe(false);
        stop();
    });

    it('the disposer removes the listeners and the mark', () => {
        const { grid, outside, stop } = setup();
        stop();
        expect(grid.hasAttribute(POINTER_ATTR)).toBe(false);
        grid.querySelector('#cell')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        expect(grid.hasAttribute(POINTER_ATTR), 'a listener survived its disposer').toBe(false);
        key(outside, 'Tab');
    });
});
