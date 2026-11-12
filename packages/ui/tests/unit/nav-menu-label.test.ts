// `label` names the menu's navigation landmark (#1023).
//
// The menu's `role="navigation"` element had one fixed name, «Navigation». Two menus on a page —
// pdx-app-shell's rail and its catalogue — were two landmarks with the same name, which axe reports
// (landmark-unique) and a screen-reader user cannot tell apart. An `aria-label` on the host names
// the host, which has no role, not the landmark inside it.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

async function mount(attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    (el as any).items = [{ key: 'a', label: 'A', href: '/a' }];
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const landmark = (el: HTMLElement) => el.querySelector('[role="navigation"]')!;

describe('pdx-nav-menu label', () => {
    beforeEach(cleanup);

    it('names the navigation landmark', async () => {
        const el = await mount({ label: 'Main navigation' });
        expect(landmark(el).getAttribute('aria-label')).toBe('Main navigation');
    });

    it('a label set later renames it', async () => {
        const el = await mount({ label: 'One' });
        el.setAttribute('label', 'Two');
        await tick(20);
        expect(landmark(el).getAttribute('aria-label')).toBe('Two');
    });

    it('control — without a label the landmark keeps the menu\'s own name', async () => {
        const el = await mount();
        expect(landmark(el).getAttribute('aria-label')).toBe('Navigation');
    });
});
