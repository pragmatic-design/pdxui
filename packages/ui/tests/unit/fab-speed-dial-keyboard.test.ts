// pdx-fab's speed dial is a menu a keyboard can use, and a closed one hides its actions.
//
// A closed dial that kept its menuitems in the DOM, shrunk and transparent but focusable, would let
// Shift+Tab from the FAB land on an action nobody can see. Opening moves focus into the dial, and
// the dial answers the menu keys, not only Escape.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/fab/pdx-fab';

type Fab = HTMLElement & { open(): void; close(): void };

const ACTIONS = [
    { key: 'share', label: 'Share', icon: 'share' },
    { key: 'print', label: 'Print', icon: 'printer' },
    { key: 'copy', label: 'Copy', icon: 'copy' },
];

async function mount(attrs: Record<string, string> = {}): Promise<{ el: Fab; selects: string[] }> {
    const el = document.createElement('pdx-fab') as Fab;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    (el as unknown as { actions: unknown }).actions = ACTIONS;
    const selects: string[] = [];
    el.addEventListener('pdx-select', (e) => selects.push((e as CustomEvent).detail.key));
    document.body.appendChild(el);
    await tick(20);
    return { el, selects };
}

const fabBtn = (el: Element) => el.querySelector('button.pdx-fab') as HTMLButtonElement;
const dial = (el: Element) => el.querySelector('.pdx-fab-dial') as HTMLElement;
const focusedName = () => (document.activeElement as HTMLElement | null)?.getAttribute('aria-label');
const key = (target: Element, k: string, extra: KeyboardEventInit = {}) => {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(ev);
    return ev;
};

beforeEach(cleanup);

describe('a closed speed dial has no reachable actions', () => {
    it('the dial is inert while closed, and not once open', async () => {
        const { el } = await mount();
        expect(dial(el).hasAttribute('inert')).toBe(true);
        el.open();
        await tick();
        expect(dial(el).hasAttribute('inert')).toBe(false);
        el.close();
        await tick();
        expect(dial(el).hasAttribute('inert')).toBe(true);
    });

    it('the menu is named after the FAB', async () => {
        const { el } = await mount({ label: 'Quick actions' });
        expect(dial(el).getAttribute('aria-label')).toBe('Quick actions');
    });
});

describe('the speed dial from the keyboard', () => {
    it('Enter on the FAB opens and focuses the action nearest the FAB; ArrowUp moves away from it', async () => {
        // direction="up": the dial sits above the FAB, so the nearest action is the last in the DOM.
        const { el } = await mount({ direction: 'up' });
        fabBtn(el).focus();
        const ev = key(fabBtn(el), 'Enter');
        await tick();
        expect(ev.defaultPrevented).toBe(true);
        expect(fabBtn(el).getAttribute('aria-expanded')).toBe('true');
        expect(focusedName()).toBe('Copy');
        key(document.activeElement!, 'ArrowUp');
        expect(focusedName()).toBe('Print');
        key(document.activeElement!, 'ArrowUp');
        expect(focusedName()).toBe('Share');
        key(document.activeElement!, 'ArrowDown');
        expect(focusedName()).toBe('Print');
        key(document.activeElement!, 'End');
        expect(focusedName()).toBe('Share');
        key(document.activeElement!, 'Home');
        expect(focusedName()).toBe('Copy');
    });

    it('direction="down": ArrowDown opens it, on the first action in the DOM', async () => {
        const { el } = await mount({ direction: 'down' });
        fabBtn(el).focus();
        key(fabBtn(el), 'ArrowDown');
        await tick();
        expect(focusedName()).toBe('Share');
        key(document.activeElement!, 'ArrowDown');
        expect(focusedName()).toBe('Print');
    });

    it('Enter on an action selects it, closes, and returns focus to the FAB', async () => {
        const { el, selects } = await mount({ direction: 'up' });
        fabBtn(el).focus();
        key(fabBtn(el), 'Enter');
        await tick();
        key(document.activeElement!, 'ArrowUp');
        expect(focusedName()).toBe('Print');
        (document.activeElement as HTMLElement).click();   // Enter on a <button> is its click
        await tick();
        expect(selects).toEqual(['print']);
        expect(fabBtn(el).getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(fabBtn(el));
        expect(dial(el).hasAttribute('inert')).toBe(true);
    });

    it('Escape from an action closes and returns focus to the FAB', async () => {
        const { el } = await mount();
        fabBtn(el).focus();
        key(fabBtn(el), 'Enter');
        await tick();
        expect(focusedName()).toBe('Copy');
        key(document.activeElement!, 'Escape');
        await tick();
        expect(fabBtn(el).getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(fabBtn(el));
    });

    it('Tab from an action closes the dial at once, without preventing the Tab', async () => {
        const { el } = await mount();
        fabBtn(el).focus();
        key(fabBtn(el), 'Enter');
        await tick();
        const ev = key(document.activeElement!, 'Tab');
        expect(ev.defaultPrevented).toBe(false);
        // Inert before the browser's Tab moves: it moves on from the FAB, not to another action.
        expect(dial(el).hasAttribute('inert')).toBe(true);
        expect(document.activeElement).toBe(fabBtn(el));
    });

    it('Enter opens a hover-triggered dial too', async () => {
        const { el } = await mount({ trigger: 'hover' });
        fabBtn(el).focus();
        key(fabBtn(el), 'Enter');
        await tick();
        expect(fabBtn(el).getAttribute('aria-expanded')).toBe('true');
        expect(focusedName()).toBe('Copy');
    });

    it('a FAB without actions still emits pdx-click on Enter (native)', async () => {
        const el = document.createElement('pdx-fab');
        const clicks: unknown[] = [];
        el.addEventListener('pdx-click', () => clicks.push(1));
        document.body.appendChild(el);
        await tick(20);
        const ev = key(fabBtn(el), 'Enter');
        expect(ev.defaultPrevented).toBe(false);
        fabBtn(el).click();
        expect(clicks).toHaveLength(1);
    });
});
