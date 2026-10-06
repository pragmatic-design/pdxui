// `<pdx-navbar>`: the mobile menu is a disclosure the keyboard can close, and each navbar can be
// named.
//
// Escape closes the mobile menu, the toggle carries aria-controls and opening moves the focus; and
// a `label` keeps three navbars on one page from all being "Main navigation".
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/navbar/pdx-navbar';

const ITEMS = [
    { key: 'home', label: 'Home', href: '#', active: true },
    { key: 'docs', label: 'Docs', href: '#' },
];

async function mountNavbar(attrs = ''): Promise<HTMLElement> {
    document.body.innerHTML = `<pdx-navbar brand="Acme" ${attrs}></pdx-navbar>`;
    const el = document.body.firstElementChild as HTMLElement & { items: unknown };
    el.items = ITEMS;
    await tick(30);
    return el;
}
const toggle = (el: Element) => el.querySelector('.pdx-navbar-hamburger') as HTMLButtonElement;
function key(target: Element, k: string): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
}

describe('pdx-navbar mobile menu', () => {
    beforeEach(cleanup);

    it('the toggle controls the menu, and opening it focuses the first link', async () => {
        const el = await mountNavbar();
        const t = toggle(el);
        const menu = document.getElementById(t.getAttribute('aria-controls') ?? '');
        expect(menu?.classList.contains('pdx-navbar-drawer')).toBe(true);
        t.click();
        await tick(20);
        expect(t.getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(menu!.querySelector('a'));
    });

    it('Escape closes it and returns focus to the toggle', async () => {
        const el = await mountNavbar();
        const t = toggle(el);
        t.click();
        await tick(20);
        const link = document.activeElement as HTMLElement;
        expect(key(link, 'Escape').defaultPrevented).toBe(true);
        expect(t.getAttribute('aria-expanded')).toBe('false');
        expect(el.querySelector('.pdx-navbar-drawer')?.classList.contains('pdx-navbar-drawer-open')).toBe(false);
        expect(document.activeElement).toBe(t);
    });

    it('Escape with the menu closed does nothing', async () => {
        const el = await mountNavbar();
        const t = toggle(el);
        t.focus();
        expect(key(t, 'Escape').defaultPrevented).toBe(false);
    });
});

describe('pdx-navbar items without href', () => {
    beforeEach(cleanup);

    it('are links the keyboard reaches, and a click does not navigate', async () => {
        document.body.innerHTML = '<pdx-navbar brand="Acme"></pdx-navbar>';
        const el = document.body.firstElementChild as HTMLElement & { items: unknown };
        el.items = [{ key: 'dashboard', label: 'Dashboard' }];
        await tick(30);
        const selected: string[] = [];
        el.addEventListener('pdx-select', (e) => selected.push((e as CustomEvent).detail.key));
        const link = el.querySelector('.pdx-navbar-nav a') as HTMLAnchorElement;
        // An <a> with no href is not a link and takes no focus: an app navigation drawn that way
        // cannot be reached from the keyboard.
        expect(link.hasAttribute('href')).toBe(true);
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
        expect(selected).toEqual(['dashboard']);
    });
});

describe('pdx-navbar landmark name', () => {
    beforeEach(cleanup);

    it('label names the navigation, desktop and mobile', async () => {
        const el = await mountNavbar('label="Account"');
        const navs = el.querySelectorAll('nav');
        expect(navs.length).toBe(2);
        for (const nav of navs) expect(nav.getAttribute('aria-label')).toBe('Account');
    });

    it('without label, the registry string', async () => {
        const el = await mountNavbar();
        expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Main navigation');
    });
});
