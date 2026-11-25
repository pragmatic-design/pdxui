// Navigation items with a badge, a collapsed rail and a breadcrumb ellipsis are named for what they
// are.
//
// - pdx-bottom-nav and pdx-nav-menu name a badged item "Messages, 3 new", from a component string,
//   not "3Messages" / "Inbox12": the count glued to the label, with no context.
// - pdx-nav-menu collapsed to icons has more than `title` for a name; group toggles carry
//   aria-controls beside aria-expanded.
// - pdx-breadcrumb's collapse ellipsis is a button named from a component string, not a <span> with a
//   click handler named "…" that takes no focus, and Enter expands the path.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/bottom-nav/pdx-bottom-nav.pdx';
import '../../src/nav-menu/pdx-nav-menu';
import '../../src/breadcrumb/pdx-breadcrumb.pdx';

async function create(tag: string, props: Record<string, unknown>): Promise<HTMLElement> {
    const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
    Object.assign(el, props);
    document.body.appendChild(el);
    await tick(40);
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-bottom-nav badge', () => {
    // #1154: the badge is drawn in the icon, before the label. The name holds what is shown, in the
    // order shown (WCAG 2.5.3, label in name): "3 Messages", and the text has a space between the two.
    it('names a badged item with the text it shows, in the order shown', async () => {
        const el = await create('pdx-bottom-nav', { items: [
            { key: 'home', label: 'Home', icon: 'home' },
            { key: 'msg', label: 'Messages', icon: 'mail', badge: '3' },
        ] });
        const msg = el.querySelector('[data-nav-key="msg"]')!;
        const text = (msg.textContent ?? '').replace(/\s+/g, ' ').trim();
        expect(text).toBe('3 Messages');
        expect(msg.getAttribute('aria-label')).toContain(text);
        expect(el.querySelector('[data-nav-key="home"]')!.hasAttribute('aria-label')).toBe(false);
    });
});

describe('pdx-nav-menu', () => {
    const items = [
        { key: 'inbox', label: 'Inbox', icon: 'inbox', badge: '12' },
        { key: 'admin', label: 'Administration', icon: 'settings', expanded: true, children: [{ key: 'users', label: 'Users' }] },
    ];

    it('names a badged item with its label and the count in context', async () => {
        const el = await create('pdx-nav-menu', { items });
        expect(el.querySelector('[data-nav-key="inbox"]')!.getAttribute('aria-label')).toBe('Inbox, 12 new');
    });

    it('names icon-only items when collapsed, and shows their label on focus as well as hover', async () => {
        const el = await create('pdx-nav-menu', { items, collapsed: true });
        const inbox = el.querySelector('[data-nav-key="inbox"]')!;
        expect(inbox.getAttribute('aria-label')).toBe('Inbox');
        expect(inbox.getAttribute('data-tooltip')).toBe('Inbox');
    });

    it('points an expanded group toggle at its group', async () => {
        const el = await create('pdx-nav-menu', { items });
        const toggle = el.querySelector('[data-nav-key="admin"]')!;
        const id = toggle.getAttribute('aria-controls');
        expect(id).toBeTruthy();
        expect(el.querySelector(`#${id}`)!.getAttribute('role')).toBe('group');
    });
});

describe('pdx-breadcrumb ellipsis', () => {
    const items = ['Home', 'Library', 'Data', 'Reports', 'Q3'].map((label, i) => ({ key: 'k' + i, label, href: '#' + i }));

    it('is a button named from the component strings', async () => {
        const el = await create('pdx-breadcrumb', { items, maxItems: 3 });
        const ellipsis = el.querySelector('.pdx-breadcrumb-ellipsis')!;
        expect(ellipsis.tagName).toBe('BUTTON');
        expect(ellipsis.getAttribute('aria-label')).toBe('Show path');
    });

    it('expands the path when activated, and focus stays on the path', async () => {
        const el = await create('pdx-breadcrumb', { items, maxItems: 3 });
        const ellipsis = el.querySelector<HTMLButtonElement>('.pdx-breadcrumb-ellipsis')!;
        ellipsis.focus();
        ellipsis.click();
        await tick(20);
        expect(el.querySelectorAll('.pdx-breadcrumb-item').length).toBe(5);
        expect(el.querySelector('.pdx-breadcrumb-ellipsis')).toBeNull();
        expect(el.contains(document.activeElement)).toBe(true);
    });
});
