// A submenu opened from the keyboard does not take the focus back from where the reader put it.
//
// ArrowRight, Enter or Space on a submenu entry opens it and focuses its first item one frame later.
// A frame that runs `first.focus()` unconditionally pulls back a reader who has already moved to
// another item, and the Enter they press picks the first item: the showcase's profile menu,
// ArrowRight on Settings, focus on Dark, Enter — and the scheme stays light, under the load of the
// full suite. The menu's own opening keeps a moved focus the same way.
//
// The frames are driven by hand, as in dropdown-menu-focus-kept.test.ts: on timers, whether a focus
// lands between the build and the frame is luck.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/dropdown-menu/pdx-dropdown-menu';

const ITEMS = [
    { key: 'profile', label: 'Profile' },
    { key: 'settings', label: 'Settings', type: 'submenu', children: [
        { key: 'light', label: 'Light' },
        { key: 'dark', label: 'Dark' },
    ] },
];

let frames: FrameRequestCallback[] = [];
/** Run the frames queued so far, and only those. */
function frame(): void {
    const now = frames;
    frames = [];
    for (const cb of now) cb(performance.now());
}

describe('a submenu keeps a focus the reader moved', () => {
    beforeEach(() => {
        cleanup();
        frames = [];
    });
    afterEach(() => {
        vi.restoreAllMocks();
        document.querySelectorAll('[data-submenu-key]').forEach((el) => el.remove());
    });

    const entries = () => [...document.querySelectorAll<HTMLElement>('.pdx-dropdown-menu-panel .pdx-menu-item')];
    const subItems = () => [...document.querySelectorAll<HTMLElement>('[data-submenu-key="settings"] .pdx-menu-item')];
    const focused = () => document.activeElement?.textContent?.trim();

    /** Open the menu, let it build and settle, and put the focus on Settings. */
    async function openOnSettings(): Promise<HTMLElement> {
        const el = document.createElement('pdx-dropdown-menu');
        el.setAttribute('label', 'Me');
        (el as any).items = ITEMS;
        document.body.appendChild(el);
        await tick(50);
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
        (el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement).click();
        for (let n = 0; n < 5 && !entries().length; n++) frame();
        for (let i = 0; i < 4; i++) frame();
        const settings = entries().find((e) => e.textContent?.includes('Settings'))!;
        settings.focus();
        expect(focused()).toContain('Settings');
        return settings;
    }

    function press(target: HTMLElement, key: string): void {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }

    it('ArrowRight: an item focused before the frame keeps the focus', async () => {
        const settings = await openOnSettings();
        press(settings, 'ArrowRight');
        expect(subItems().length, 'ArrowRight did not open the submenu').toBe(2);
        subItems()[1].focus();
        for (let i = 0; i < 4; i++) frame();
        expect(focused(), 'the submenu pulled the focus back to its first item').toBe('Dark');
    });

    it('Enter: an item focused before the frame keeps the focus', async () => {
        const settings = await openOnSettings();
        settings.click();
        expect(subItems().length, 'activating Settings did not open the submenu').toBe(2);
        subItems()[1].focus();
        for (let i = 0; i < 4; i++) frame();
        expect(focused(), 'the submenu pulled the focus back to its first item').toBe('Dark');
    });

    it('control — with nothing moved, ArrowRight focuses the first item', async () => {
        const settings = await openOnSettings();
        press(settings, 'ArrowRight');
        for (let i = 0; i < 4; i++) frame();
        expect(focused()).toBe('Light');
    });
});
