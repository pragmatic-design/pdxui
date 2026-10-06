// Tests for pdx-menubar component.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/menubar/pdx-menubar';

const BASIC_ITEMS = [
    {
        key: 'file', label: 'File',
        children: [
            { key: 'new', label: 'New' },
            { key: 'open', label: 'Open' },
            { key: 'sep1', label: '', type: 'separator' as const },
            { key: 'exit', label: 'Exit' },
        ]
    },
    {
        key: 'edit', label: 'Edit',
        children: [
            { key: 'undo', label: 'Undo', icon: '↩', shortcut: 'Ctrl+Z' },
            { key: 'redo', label: 'Redo' },
        ]
    },
    {
        key: 'view', label: 'View',
        children: [
            { key: 'sidebar', label: 'Sidebar', type: 'checkbox' as const, checked: true },
            { key: 'minimap', label: 'Minimap', type: 'checkbox' as const, checked: false },
        ]
    },
];

const MEGA_ITEMS = [
    {
        key: 'products', label: 'Products', mega: true,
        megaColumns: [
            { title: 'Dev', items: [{ key: 'ide', label: 'IDE' }, { key: 'ci', label: 'CI/CD' }] },
            { title: 'Design', items: [{ key: 'figma', label: 'Designer' }] },
        ]
    },
];

describe('pdx-menubar', () => {
    beforeEach(cleanup);

    async function mountMenubar(items: any[] = BASIC_ITEMS): Promise<HTMLElement> {
        const el = document.createElement('pdx-menubar') as any;
        document.body.appendChild(el);
        await tick(50);
        el.items = items;
        await tick(200);
        return el;
    }

    // ─── Rendering ───────────────────────────────────────

    it('renders menubar with role=menubar', async () => {
        const el = await mountMenubar();
        const bar = el.querySelector('[role="menubar"]');
        expect(bar).toBeTruthy();
    });

    it('renders correct number of trigger buttons', async () => {
        const el = await mountMenubar();
        const triggers = el.querySelectorAll('.pdx-menubar-trigger');
        expect(triggers.length).toBe(3);
    });

    it('renders trigger labels', async () => {
        const el = await mountMenubar();
        const triggers = el.querySelectorAll('.pdx-menubar-trigger');
        expect(triggers[0]?.textContent).toBe('File');
        expect(triggers[1]?.textContent).toBe('Edit');
        expect(triggers[2]?.textContent).toBe('View');
    });

    it('sets aria-haspopup on triggers', async () => {
        const el = await mountMenubar();
        const trigger = el.querySelector('.pdx-menubar-trigger')!;
        expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    });

    it('sets aria-expanded=false initially', async () => {
        const el = await mountMenubar();
        const trigger = el.querySelector('.pdx-menubar-trigger')!;
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    // ─── Open/Close ──────────────────────────────────────

    it('opens menu on click', async () => {
        const el = await mountMenubar();
        const trigger = el.querySelector('.pdx-menubar-trigger') as HTMLElement;
        trigger.click();
        await tick(100);

        const panel = document.querySelector('.pdx-menubar-panel');
        expect(panel).toBeTruthy();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('renders menu items in panel', async () => {
        const el = await mountMenubar();
        const trigger = el.querySelector('.pdx-menubar-trigger') as HTMLElement;
        trigger.click();
        await tick(100);

        const items = document.querySelectorAll('.pdx-menubar-panel .pdx-menu-item');
        expect(items.length).toBe(3); // New, Open, Exit (separator excluded)
    });

    it('renders separator in panel', async () => {
        const el = await mountMenubar();
        const trigger = el.querySelector('.pdx-menubar-trigger') as HTMLElement;
        trigger.click();
        await tick(100);

        const seps = document.querySelectorAll('.pdx-menubar-panel .pdx-menu-separator');
        expect(seps.length).toBe(1);
    });

    it('closes menu on second click', async () => {
        const el = await mountMenubar();
        const trigger = el.querySelector('.pdx-menubar-trigger') as HTMLElement;
        trigger.click();
        await tick(100);
        trigger.click();
        await tick(100);

        const panel = document.querySelector('.pdx-menubar-panel');
        expect(panel).toBeNull();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    // ─── Events ──────────────────────────────────────────

    it('emits pdx-select on item click', async () => {
        const el = await mountMenubar();
        let detail: any = null;
        el.addEventListener('pdx-select', (e: any) => { detail = e.detail; });

        const trigger = el.querySelector('.pdx-menubar-trigger') as HTMLElement;
        trigger.click();
        await tick(100);

        const item = document.querySelector('.pdx-menubar-panel [data-menu-key="new"]') as HTMLElement;
        item.click();
        await tick(50);

        expect(detail).toBeTruthy();
        expect(detail.key).toBe('new');
    });

    it('emits pdx-check on checkbox click', async () => {
        const el = await mountMenubar();
        let detail: any = null;
        el.addEventListener('pdx-check', (e: any) => { detail = e.detail; });

        // Open View menu (3rd trigger)
        const triggers = el.querySelectorAll('.pdx-menubar-trigger');
        (triggers[2] as HTMLElement).click();
        await tick(100);

        const minimap = document.querySelector('.pdx-menubar-panel [data-menu-key="minimap"]') as HTMLElement;
        minimap.click();
        await tick(50);

        expect(detail).toBeTruthy();
        expect(detail.key).toBe('minimap');
        expect(detail.checked).toBe(true);
    });

    // ─── Icons & Shortcuts ───────────────────────────────

    it('renders icons in menu items', async () => {
        const el = await mountMenubar();
        const triggers = el.querySelectorAll('.pdx-menubar-trigger');
        (triggers[1] as HTMLElement).click();
        await tick(100);

        const icon = document.querySelector('.pdx-menubar-panel .pdx-menu-icon');
        expect(icon).toBeTruthy();
    });

    it('renders shortcut text', async () => {
        const el = await mountMenubar();
        const triggers = el.querySelectorAll('.pdx-menubar-trigger');
        (triggers[1] as HTMLElement).click();
        await tick(100);

        const shortcut = document.querySelector('.pdx-menubar-panel .pdx-menu-shortcut');
        expect(shortcut?.textContent).toBe('Ctrl+Z');
    });

    // ─── Mega Menu ───────────────────────────────────────

    it('renders mega menu panel with columns', async () => {
        const el = await mountMenubar(MEGA_ITEMS);
        const trigger = el.querySelector('.pdx-menubar-trigger') as HTMLElement;
        trigger.click();
        await tick(100);

        const mega = document.querySelector('.pdx-menubar-mega');
        expect(mega).toBeTruthy();

        const columns = document.querySelectorAll('.pdx-mega-column');
        expect(columns.length).toBe(2);
    });

    it('renders column titles in mega menu', async () => {
        const el = await mountMenubar(MEGA_ITEMS);
        const trigger = el.querySelector('.pdx-menubar-trigger') as HTMLElement;
        trigger.click();
        await tick(100);

        const labels = document.querySelectorAll('.pdx-mega-column .pdx-menu-label');
        expect(labels[0]?.textContent).toBe('Dev');
        expect(labels[1]?.textContent).toBe('Design');
    });

    it('renders items inside mega columns', async () => {
        const el = await mountMenubar(MEGA_ITEMS);
        const trigger = el.querySelector('.pdx-menubar-trigger') as HTMLElement;
        trigger.click();
        await tick(100);

        const items = document.querySelectorAll('.pdx-mega-column .pdx-menu-item');
        expect(items.length).toBe(3); // IDE, CI/CD, Designer
    });

    // ─── Disabled ────────────────────────────────────────

    it('disables trigger for disabled items', async () => {
        const items = [
            { key: 'a', label: 'Active', children: [{ key: 'x', label: 'X' }] },
            { key: 'b', label: 'Disabled', disabled: true, children: [] },
        ];
        const el = await mountMenubar(items);
        const triggers = el.querySelectorAll('.pdx-menubar-trigger');
        expect((triggers[1] as HTMLButtonElement).disabled).toBe(true);
    });
});
