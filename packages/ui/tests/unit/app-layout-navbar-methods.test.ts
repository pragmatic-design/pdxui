// pdx-app-layout's openNavbar() and closeNavbar() act on the desktop navbar too.
//
// Like toggleNavbar(), they work in both modes, not only on the mobile drawer's state: at 1440px
// `el.closeNavbar()` must collapse the navbar. Above the breakpoint the navbar is the
// `navbarCollapsed` property, which is what toggleNavbar() sets; the methods set it too.
// happy-dom's window is 1024px wide, above the layout's default 768px breakpoint: this is desktop.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/app-layout/pdx-app-layout';

type Layout = HTMLElement & {
    navbarCollapsed: boolean;
    openNavbar(): void; closeNavbar(): void; toggleNavbar(): void;
};

async function layout(): Promise<Layout> {
    const el = document.createElement('pdx-app-layout') as Layout;
    el.innerHTML = '<div data-region="header">H</div><div data-region="navbar">N</div><div>Main</div>';
    document.body.appendChild(el);
    await tick(20);
    return el;
}

const navColumn = (el: HTMLElement) => el.style.gridTemplateColumns.split(' ')[0];

describe('pdx-app-layout navbar methods above the breakpoint', () => {
    beforeEach(cleanup);

    it('the premise: happy-dom is above the breakpoint', () => {
        expect(window.matchMedia('(max-width: 768px)').matches).toBe(false);
    });

    it('closeNavbar() collapses the desktop navbar, openNavbar() expands it again', async () => {
        const el = await layout();
        expect(navColumn(el)).toBe('260px');

        el.closeNavbar();
        expect(el.navbarCollapsed, 'closeNavbar() left the desktop navbar open').toBe(true);
        await tick();
        expect(navColumn(el)).toBe('60px');

        el.openNavbar();
        expect(el.navbarCollapsed, 'openNavbar() left the desktop navbar collapsed').toBe(false);
        await tick();
        expect(navColumn(el)).toBe('260px');
    });

    it('each is idempotent, and toggleNavbar() still flips', async () => {
        const el = await layout();
        el.closeNavbar();
        el.closeNavbar();
        expect(el.navbarCollapsed).toBe(true);
        el.toggleNavbar();
        expect(el.navbarCollapsed).toBe(false);
        el.openNavbar();
        expect(el.navbarCollapsed).toBe(false);
    });
});
