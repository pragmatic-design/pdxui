// Tests for pdx-nav-menu component.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/nav-menu/pdx-nav-menu';

const BASIC_ITEMS = [
    { key: 'home', label: 'Home' },
    { key: 'about', label: 'About' },
    { key: 'contact', label: 'Contact' },
];

const ICON_ITEMS = [
    { key: 'inbox', label: 'Inbox', icon: '📥' },
    { key: 'sent', label: 'Sent', icon: '📤' },
];

const NESTED_ITEMS = [
    { key: 'home', label: 'Home' },
    { key: 'admin', label: 'Admin', expanded: true, children: [
        { key: 'users', label: 'Users' },
        { key: 'roles', label: 'Roles' },
    ]},
];

const FULL_ITEMS = [
    { key: 'hdr', label: 'Section', type: 'header' as const },
    { key: 'item1', label: 'Item 1', icon: '📄', badge: '5', badgeVariant: 'primary' as const },
    { key: 'sep', label: '', type: 'separator' as const },
    { key: 'disabled', label: 'Disabled', disabled: true },
    { key: 'group', label: 'Group', children: [
        { key: 'child1', label: 'Child 1' },
    ]},
];

describe('pdx-nav-menu', () => {
    beforeEach(cleanup);

    async function mountNav(items: any[] = BASIC_ITEMS, props: Record<string, any> = {}): Promise<HTMLElement> {
        const el = document.createElement('pdx-nav-menu') as any;
        document.body.appendChild(el);
        await tick(50);
        el.items = items;
        if (props.activeKey) el.activeKey = props.activeKey;
        if (props.collapsed) el.collapsed = true;
        await tick(200);
        return el;
    }

    // ─── Rendering ───────────────────────────────────────

    it('renders nav element with role=navigation', async () => {
        const el = await mountNav();
        const nav = el.querySelector('[role="navigation"]');
        expect(nav).toBeTruthy();
    });

    it('renders correct number of items', async () => {
        const el = await mountNav();
        const items = el.querySelectorAll('.pdx-nav-item');
        expect(items.length).toBe(3);
    });

    it('renders item labels', async () => {
        const el = await mountNav();
        const labels = el.querySelectorAll('.pdx-nav-label');
        expect(labels[0]?.textContent).toBe('Home');
        expect(labels[1]?.textContent).toBe('About');
    });

    // ─── Active state ────────────────────────────────────

    it('marks active item', async () => {
        const el = await mountNav(BASIC_ITEMS, { activeKey: 'about' });
        const active = el.querySelector('[data-nav-key="about"]')!;
        expect(active.classList.contains('active')).toBe(true);
        expect(active.getAttribute('aria-current')).toBe('page');
    });

    // ─── Icons ───────────────────────────────────────────

    it('renders icons', async () => {
        const el = await mountNav(ICON_ITEMS);
        const icons = el.querySelectorAll('.pdx-nav-icon');
        expect(icons.length).toBe(2);
    });

    // ─── Badges ──────────────────────────────────────────

    it('renders badges', async () => {
        const el = await mountNav(FULL_ITEMS);
        const badge = el.querySelector('.pdx-nav-badge');
        expect(badge).toBeTruthy();
        expect(badge?.textContent).toBe('5');
    });

    it('applies badge variant', async () => {
        const el = await mountNav(FULL_ITEMS);
        const badge = el.querySelector('.pdx-nav-badge');
        expect(badge?.classList.contains('pdx-nav-badge-primary')).toBe(true);
    });

    // ─── Headers & Separators ────────────────────────────

    it('renders section headers', async () => {
        const el = await mountNav(FULL_ITEMS);
        const hdr = el.querySelector('.pdx-nav-heading');
        expect(hdr).toBeTruthy();
        expect(hdr?.textContent).toBe('Section');
    });

    it('renders separators', async () => {
        const el = await mountNav(FULL_ITEMS);
        const sep = el.querySelector('.pdx-nav-separator');
        expect(sep).toBeTruthy();
    });

    // ─── Disabled ────────────────────────────────────────

    it('disables items', async () => {
        const el = await mountNav(FULL_ITEMS);
        const disabled = el.querySelector('[data-nav-key="disabled"]') as HTMLButtonElement;
        expect(disabled?.disabled).toBe(true);
        expect(disabled?.getAttribute('aria-disabled')).toBe('true');
    });

    // ─── Nested Groups ──────────────────────────────────

    it('renders expanded group children', async () => {
        const el = await mountNav(NESTED_ITEMS);
        const users = el.querySelector('[data-nav-key="users"]');
        expect(users).toBeTruthy();
    });

    it('sets aria-expanded on group trigger', async () => {
        const el = await mountNav(NESTED_ITEMS);
        const admin = el.querySelector('[data-nav-key="admin"]')!;
        expect(admin.getAttribute('aria-expanded')).toBe('true');
    });

    it('renders chevron on group items', async () => {
        const el = await mountNav(NESTED_ITEMS);
        const chevron = el.querySelector('.pdx-nav-chevron');
        expect(chevron).toBeTruthy();
    });

    it('collapses group on click', async () => {
        const el = await mountNav(NESTED_ITEMS);
        const admin = el.querySelector('[data-nav-key="admin"]') as HTMLElement;
        admin.click();
        await tick(200);

        // After collapse, the admin trigger should still exist but children gone
        const adminAfter = el.querySelector('[data-nav-key="admin"]') as HTMLElement;
        expect(adminAfter.getAttribute('aria-expanded')).toBe('false');
        const users = el.querySelector('[data-nav-key="users"]');
        expect(users).toBeNull();
    });

    // ─── Collapsed mode ─────────────────────────────────

    it('hides labels in collapsed mode', async () => {
        const el = await mountNav(ICON_ITEMS, { collapsed: true });
        const labels = el.querySelectorAll('.pdx-nav-label');
        expect(labels.length).toBe(0);
    });

    it('names a collapsed item by its label, and shows it as a tooltip on hover and focus', async () => {
        // Not `title`: a name in Chromium, a tooltip for the mouse only. The label is the
        // accessible name and a CSS tooltip that also shows on :focus-visible; no `title`, or
        // hover would show two tooltips.
        const el = await mountNav(ICON_ITEMS, { collapsed: true });
        const item = el.querySelector('[data-nav-key="inbox"]') as HTMLElement;
        expect(item.getAttribute('aria-label')).toBe('Inbox');
        expect(item.getAttribute('data-tooltip')).toBe('Inbox');
        expect(item.title).toBe('');
    });

    // ─── Events ──────────────────────────────────────────

    it('emits pdx-select on item click', async () => {
        const el = await mountNav();
        let detail: any = null;
        el.addEventListener('pdx-select', (e: any) => { detail = e.detail; });

        const item = el.querySelector('[data-nav-key="about"]') as HTMLElement;
        item.click();
        await tick(50);

        expect(detail).toBeTruthy();
        expect(detail.key).toBe('about');
    });

    it('does not emit pdx-select for group triggers', async () => {
        const el = await mountNav(NESTED_ITEMS);
        let detail: any = null;
        el.addEventListener('pdx-select', (e: any) => { detail = e.detail; });

        const admin = el.querySelector('[data-nav-key="admin"]') as HTMLElement;
        admin.click();
        await tick(50);

        expect(detail).toBeNull(); // group toggle, not select
    });
});
