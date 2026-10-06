// An opening does not take the focus back from where the reader already put it.
//
// `pdx-dropdown-menu` focuses its first entry two frames after it opens: the menu builds in one and
// focuses in the next. A reader — or a test — who moves to another entry between those frames must
// not have the focus pulled back to the first one, or the ArrowRight they press on «Settings» lands
// on «Profile», and the showcase's profile menu loses its Settings submenu.
//
// The frames are driven by hand here: in happy-dom they run on timers, and whether a focus lands
// between two of them is luck — on timers, this test passes without the fix.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/dropdown-menu/pdx-dropdown-menu';

const ITEMS = [{ key: 'profile', label: 'Profile' }, { key: 'settings', label: 'Settings' }, { key: 'out', label: 'Sign out' }];

let frames: FrameRequestCallback[] = [];
/** Run the frames queued so far, and only those. */
function frame(): void {
    const now = frames;
    frames = [];
    for (const cb of now) cb(performance.now());
}

describe('pdx-dropdown-menu keeps a focus the reader moved', () => {
    beforeEach(async () => {
        cleanup();
        frames = [];
    });
    afterEach(() => vi.restoreAllMocks());

    async function open(): Promise<void> {
        const el = document.createElement('pdx-dropdown-menu');
        el.setAttribute('label', 'Me');
        (el as any).items = ITEMS;
        document.body.appendChild(el);
        await tick(50);
        // From here on, a frame runs when the test says so.
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
        (el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement).click();
    }

    const entries = () => [...document.querySelectorAll<HTMLElement>('.pdx-dropdown-menu-panel .pdx-menu-item')];
    const focused = () => document.activeElement?.textContent?.trim();

    /** Run frames until the entries exist, and say how many it took. */
    function untilBuilt(): number {
        for (let n = 1; n <= 5; n++) { frame(); if (entries().length) return n; }
        return -1;
    }

    it('an entry focused between the build and the focus keeps the focus', async () => {
        await open();
        expect(untilBuilt(), 'the menu never built its entries').toBeGreaterThan(0);
        entries()[1].focus();
        expect(focused()).toBe('Settings');
        for (let i = 0; i < 4; i++) frame();
        expect(focused(), 'the opening pulled the focus back to the first entry').toBe('Settings');
    });

    it('control — with nothing moved, the opening focuses the first entry', async () => {
        await open();
        untilBuilt();
        for (let i = 0; i < 4; i++) frame();
        expect(focused()).toBe('Profile');
    });
});
