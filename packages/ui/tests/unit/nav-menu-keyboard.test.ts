// pdx-nav-menu from the keyboard.
//
// Without keys, Tab walks every entry of a navigation one by one, and a group opens only on a click.
//
// The WAI-ARIA APG disclosure navigation with a roving tabindex — ONE Tab stop for the whole menu:
//   ArrowDown / ArrowUp  the next / previous VISIBLE entry (no wrap, disabled skipped);
//   Home / End           the first / last;
//   ArrowRight           on a closed group, opens it; on an open one, moves to its first child;
//   ArrowLeft            on an open group, closes it; on a child, moves to its parent;
//   Space                activates an entry that is a link, as Enter already does natively.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

const ITEMS = [
    { key: 'dashboard', label: 'Dashboard', href: '/' },
    { key: 'tickets', label: 'Tickets', children: [
        { key: 'all', label: 'All', href: '/tickets' },
        { key: 'mine', label: 'Mine', href: '/tickets/mine' },
    ] },
    { key: 'settings', label: 'Settings', href: '/settings' },
    { key: 'off', label: 'Off', href: '/off', disabled: true },
];

async function mount(activeKey = 'dashboard'): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    (el as any).items = ITEMS.map(i => ({ ...i }));
    el.setAttribute('active-key', activeKey);
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const entry = (el: HTMLElement, key: string) => el.querySelector(`[data-nav-key="${key}"]`) as HTMLElement;
const focusedKey = () => (document.activeElement as HTMLElement | null)?.getAttribute('data-nav-key');

async function press(key: string): Promise<KeyboardEvent> {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(ev);
    await tick(30);
    return ev;
}

describe('pdx-nav-menu keyboard', () => {
    beforeEach(cleanup);

    it('is ONE Tab stop: the active entry is tabbable, every other one is not', async () => {
        const el = await mount('settings');
        const stops = [...el.querySelectorAll<HTMLElement>('.pdx-nav-item')].filter(e => e.tabIndex === 0);
        expect(stops.map(e => e.getAttribute('data-nav-key'))).toEqual(['settings']);
    });

    it('ArrowDown and ArrowUp move between visible entries, skipping a disabled one, without wrapping', async () => {
        const el = await mount();
        entry(el, 'dashboard').focus();
        expect((await press('ArrowDown')).defaultPrevented).toBe(true);
        expect(focusedKey()).toBe('tickets');
        await press('ArrowDown');
        expect(focusedKey(), 'a closed group\'s children are not visible').toBe('settings');
        await press('ArrowDown');
        expect(focusedKey(), 'moved onto a disabled entry, or wrapped').toBe('settings');
        await press('ArrowUp');
        expect(focusedKey()).toBe('tickets');
    });

    it('Home and End go to the first and the last', async () => {
        const el = await mount();
        entry(el, 'tickets').focus();
        await press('End');
        expect(focusedKey()).toBe('settings');
        await press('Home');
        expect(focusedKey()).toBe('dashboard');
    });

    it('ArrowRight opens a closed group, then moves into it', async () => {
        const el = await mount();
        entry(el, 'tickets').focus();
        await press('ArrowRight');
        expect(entry(el, 'tickets').getAttribute('aria-expanded')).toBe('true');
        expect(focusedKey(), 'opening the group lost the focus').toBe('tickets');
        await press('ArrowRight');
        expect(focusedKey()).toBe('all');
        // Its children are entries like the others now.
        await press('ArrowDown');
        expect(focusedKey()).toBe('mine');
    });

    it('ArrowLeft goes from a child to its parent, then closes the parent', async () => {
        const el = await mount();
        entry(el, 'tickets').focus();
        await press('ArrowRight');
        await press('ArrowRight');
        expect(focusedKey()).toBe('all');
        await press('ArrowLeft');
        expect(focusedKey()).toBe('tickets');
        await press('ArrowLeft');
        expect(entry(el, 'tickets').getAttribute('aria-expanded')).toBe('false');
        expect(focusedKey()).toBe('tickets');
    });

    it('the Tab stop follows the focus, so Tab comes back to where the reader was', async () => {
        const el = await mount();
        entry(el, 'dashboard').focus();
        await press('ArrowDown');
        const stops = [...el.querySelectorAll<HTMLElement>('.pdx-nav-item')].filter(e => e.tabIndex === 0);
        expect(stops.map(e => e.getAttribute('data-nav-key'))).toEqual(['tickets']);
    });

    it('Space activates an entry that is a link', async () => {
        const el = await mount();
        let selected = '';
        el.addEventListener('pdx-select', (e) => { selected = (e as CustomEvent).detail.key; });
        // A link's default action is a navigation; this row is about the key reaching it.
        entry(el, 'settings').addEventListener('click', (e) => e.preventDefault());
        entry(el, 'settings').focus();
        const ev = await press(' ');
        expect(ev.defaultPrevented, 'Space scrolled the page instead').toBe(true);
        expect(selected).toBe('settings');
    });

    it('control — a key it does not handle is left alone', async () => {
        const el = await mount();
        entry(el, 'dashboard').focus();
        const ev = await press('a');
        expect(ev.defaultPrevented).toBe(false);
        expect(focusedKey()).toBe('dashboard');
    });
});
