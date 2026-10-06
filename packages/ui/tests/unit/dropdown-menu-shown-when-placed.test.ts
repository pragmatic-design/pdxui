// A menu is not shown before it is placed.
//
// `pdx-dropdown-menu` appends its menu to <body> and places it at once — when the menu has not built
// its entries and has no size. With an `end` placement that puts its left edge on the trigger's right
// edge, and the clamp to the viewport, reading a width of 0, leaves it there: for the two frames until
// the menu is placed again, it would hang off the screen — the showcase's profile menu at 390 reaches
// a right edge of 574 under load.
//
// The frames are driven by hand, for the reason `dropdown-menu-focus-kept.test.ts` gives.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/dropdown-menu/pdx-dropdown-menu';

const ITEMS = [{ key: 'profile', label: 'Profile' }, { key: 'settings', label: 'Settings' }];

let frames: FrameRequestCallback[] = [];
function frame(): void {
    const now = frames;
    frames = [];
    for (const cb of now) cb(performance.now());
}

describe('pdx-dropdown-menu shows its menu only once it is placed', () => {
    beforeEach(() => {
        cleanup();
        frames = [];
    });
    afterEach(() => vi.restoreAllMocks());

    async function open(): Promise<HTMLElement> {
        const el = document.createElement('pdx-dropdown-menu');
        el.setAttribute('label', 'Me');
        el.setAttribute('placement', 'bottom-end');
        (el as any).items = ITEMS;
        document.body.appendChild(el);
        await tick(50);
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
        (el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement).click();
        const menu = document.body.querySelector<HTMLElement>(':scope > pdx-menu');
        expect(menu, 'the menu was not appended to <body>').not.toBeNull();
        return menu!;
    }

    it('hidden from its append until the frame that places it', async () => {
        const menu = await open();
        expect(menu.style.visibility, 'shown before it had a size to be placed with').toBe('hidden');
        frame();
        expect(menu.style.visibility, 'shown one frame in, before it was placed again').toBe('hidden');
        frame();
        expect(menu.style.visibility, 'still hidden once placed').toBe('');
    });

    it('control — a later placement (a scroll) keeps it shown', async () => {
        const menu = await open();
        frame();
        frame();
        window.dispatchEvent(new Event('scroll'));
        expect(menu.style.visibility).toBe('');
    });
});
