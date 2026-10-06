// With the menu collapsed to icons, a group opens in a FLYOUT beside it.
//
// `collapsed` hides every label: without a flyout, in a rail at 80px, a second level is
// unreachable. An entry with children, in a collapsed menu, opens a flyout beside it on hover,
// focus or ArrowRight — a heading with its label, and the children with theirs. Escape or
// ArrowLeft inside it closes it and gives the focus back.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

const ITEMS = [
    { key: 'dashboard', label: 'Dashboard', href: '/' },
    { key: 'tickets', label: 'Tickets', children: [
        { key: 'all', label: 'All', href: '/tickets' },
        { key: 'mine', label: 'Mine', href: '/tickets/mine' },
    ] },
];

async function mount(collapsed = true): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    (el as any).items = ITEMS.map(i => ({ ...i }));
    if (collapsed) el.setAttribute('collapsed', '');
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const entry = (el: HTMLElement, key: string) => el.querySelector(`.pdx-nav-item[data-nav-key="${key}"]`) as HTMLElement;
const flyout = () => document.querySelector('.pdx-nav-flyout') as HTMLElement | null;
const key = (k: string) => new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });

describe('pdx-nav-menu collapsed: the flyout', () => {
    beforeEach(cleanup);

    it('focusing an entry with children opens a flyout with its label and its children', async () => {
        const el = await mount();
        entry(el, 'tickets').focus();
        await tick(30);
        const f = flyout();
        expect(f, 'no flyout: the second level is unreachable').not.toBeNull();
        expect(f!.querySelector('.pdx-nav-flyout-title')?.textContent).toBe('Tickets');
        const labels = [...f!.querySelectorAll('.pdx-nav-item .pdx-nav-label')].map(l => l.textContent);
        expect(labels).toEqual(['All', 'Mine']);
        expect(entry(el, 'tickets').getAttribute('aria-expanded')).toBe('true');
        expect(document.getElementById(entry(el, 'tickets').getAttribute('aria-controls')!)).toBe(f);
    });

    it('opens on hover too', async () => {
        const el = await mount();
        entry(el, 'tickets').dispatchEvent(new PointerEvent('pointerenter'));
        await tick(30);
        expect(flyout()).not.toBeNull();
    });

    it('ArrowRight moves into it; Escape closes it and gives the focus back', async () => {
        const el = await mount();
        entry(el, 'tickets').focus();
        entry(el, 'tickets').dispatchEvent(key('ArrowRight'));
        await tick(30);
        expect((document.activeElement as HTMLElement).getAttribute('data-nav-key')).toBe('all');

        (document.activeElement as HTMLElement).dispatchEvent(key('ArrowDown'));
        await tick(30);
        expect((document.activeElement as HTMLElement).getAttribute('data-nav-key')).toBe('mine');

        (document.activeElement as HTMLElement).dispatchEvent(key('Escape'));
        await tick(30);
        expect(flyout()).toBeNull();
        expect(document.activeElement).toBe(entry(el, 'tickets'));
    });

    it('ArrowLeft inside it closes it too', async () => {
        const el = await mount();
        entry(el, 'tickets').focus();
        entry(el, 'tickets').dispatchEvent(key('ArrowRight'));
        await tick(30);
        expect(flyout(), 'nothing opened, so «it closed» would say nothing').not.toBeNull();
        (document.activeElement as HTMLElement).dispatchEvent(key('ArrowLeft'));
        await tick(30);
        expect(flyout()).toBeNull();
        expect(document.activeElement).toBe(entry(el, 'tickets'));
    });

    it('a child in it emits the same pdx-select, and the flyout closes', async () => {
        const el = await mount();
        let selected = '';
        el.addEventListener('pdx-select', (e) => { selected = (e as CustomEvent).detail.key; });
        entry(el, 'tickets').focus();
        await tick(30);
        const mine = flyout()!.querySelector('[data-nav-key="mine"]') as HTMLElement;
        mine.addEventListener('click', (e) => e.preventDefault());
        mine.click();
        await tick(30);
        expect(selected).toBe('mine');
        expect(flyout()).toBeNull();
    });

    it('a click outside closes it', async () => {
        const el = await mount();
        entry(el, 'tickets').focus();
        await tick(30);
        expect(flyout(), 'nothing opened, so «it closed» would say nothing').not.toBeNull();
        document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        await tick(30);
        expect(flyout()).toBeNull();
    });

    // A prop change rebuilds every entry in a frame: `innerHTML = ''` takes the focused one away, and
    // unless the focus is carried across it falls to <body>. An app's items are recomputed when a
    // locale section lands, so this happens under a reader's hands.
    it('new items while the focus is in the flyout: the focus stays there, on the same entry', async () => {
        const el = await mount();
        entry(el, 'tickets').focus();
        entry(el, 'tickets').dispatchEvent(key('ArrowRight'));
        await tick(30);
        (document.activeElement as HTMLElement).dispatchEvent(key('ArrowDown'));
        await tick(30);
        expect((document.activeElement as HTMLElement).getAttribute('data-nav-key')).toBe('mine');

        (el as any).items = ITEMS.map(i => ({ ...i }));
        await tick(50);
        expect(flyout(), 'the rebuild closed the flyout under the reader').not.toBeNull();
        expect(document.activeElement, 'the focus fell out of the menu').not.toBe(document.body);
        expect((document.activeElement as HTMLElement).getAttribute('data-nav-key')).toBe('mine');
        expect(flyout()!.contains(document.activeElement)).toBe(true);

        (document.activeElement as HTMLElement).dispatchEvent(key('Escape'));
        await tick(30);
        expect(flyout()).toBeNull();
        expect(document.activeElement).toBe(entry(el, 'tickets'));
    });

    it('new items while the focus is on an entry: the focus stays on that entry', async () => {
        const el = await mount(false);
        entry(el, 'dashboard').focus();
        (el as any).items = ITEMS.map(i => ({ ...i }));
        await tick(50);
        expect(document.activeElement, 'the focus fell out of the menu').toBe(entry(el, 'dashboard'));
    });

    it('control — new items while the focus is elsewhere do not pull it into the menu', async () => {
        const el = await mount(false);
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.focus();
        (el as any).items = ITEMS.map(i => ({ ...i }));
        await tick(50);
        expect(document.activeElement).toBe(outside);
    });

    it('control — an entry without children opens no flyout', async () => {
        const el = await mount();
        entry(el, 'dashboard').focus();
        await tick(30);
        expect(flyout()).toBeNull();
    });

    it('control — an expanded menu opens its groups in place, not in a flyout', async () => {
        const el = await mount(false);
        entry(el, 'tickets').focus();
        await tick(30);
        expect(flyout()).toBeNull();
    });
});
