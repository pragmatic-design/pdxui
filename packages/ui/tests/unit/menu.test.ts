// Tests for pdx-menu component.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/menu/pdx-menu';

const BASIC_ITEMS = [
    { key: 'cut', label: 'Cut', shortcut: 'Ctrl+X' },
    { key: 'copy', label: 'Copy', shortcut: 'Ctrl+C' },
    { key: 'paste', label: 'Paste', shortcut: 'Ctrl+V' },
];

const FULL_ITEMS = [
    { key: 'label1', label: 'Edit', type: 'label' as const },
    { key: 'cut', label: 'Cut', icon: '✂', shortcut: 'Ctrl+X' },
    { key: 'copy', label: 'Copy', icon: '📋', shortcut: 'Ctrl+C' },
    { key: 'sep1', label: '', type: 'separator' as const },
    { key: 'bold', label: 'Bold', type: 'checkbox' as const, checked: true },
    { key: 'italic', label: 'Italic', type: 'checkbox' as const, checked: false },
    { key: 'sep2', label: '', type: 'separator' as const },
    { key: 'small', label: 'Small', type: 'radio' as const, radioGroup: 'size', checked: false },
    { key: 'medium', label: 'Medium', type: 'radio' as const, radioGroup: 'size', checked: true },
    { key: 'large', label: 'Large', type: 'radio' as const, radioGroup: 'size', checked: false },
    { key: 'sep3', label: '', type: 'separator' as const },
    { key: 'more', label: 'More options', type: 'submenu' as const, children: [
        { key: 'sub1', label: 'Sub Item 1' },
        { key: 'sub2', label: 'Sub Item 2' },
    ]},
    { key: 'sep4', label: '', type: 'separator' as const },
    { key: 'delete', label: 'Delete', danger: true },
    { key: 'disabled', label: 'Unavailable', disabled: true },
];

describe('pdx-menu', () => {
    beforeEach(cleanup);

    async function mountMenu(items: any[] = BASIC_ITEMS, open = true): Promise<HTMLElement> {
        const el = document.createElement('pdx-menu') as any;
        el.items = items;
        if (open) el.setAttribute('open', '');
        document.body.appendChild(el);
        await tick(100);
        return el;
    }

    // ─── Rendering ───────────────────────────────────────

    it('renders menu container with role=menu', async () => {
        const el = await mountMenu();
        const menu = el.querySelector('[role="menu"]');
        expect(menu).toBeTruthy();
    });

    it('renders correct number of menu items', async () => {
        const el = await mountMenu();
        const items = el.querySelectorAll('[role="menuitem"]');
        expect(items.length).toBe(3);
    });

    it('renders item labels', async () => {
        const el = await mountMenu();
        const labels = el.querySelectorAll('.pdx-menu-item-label');
        expect(labels[0]?.textContent).toBe('Cut');
        expect(labels[1]?.textContent).toBe('Copy');
    });

    it('renders shortcut text', async () => {
        const el = await mountMenu();
        const shortcuts = el.querySelectorAll('.pdx-menu-shortcut');
        expect(shortcuts[0]?.textContent).toBe('Ctrl+X');
    });

    // ─── Item types ──────────────────────────────────────

    it('renders separators', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const seps = el.querySelectorAll('[role="separator"]');
        expect(seps.length).toBe(4);
    });

    it('renders group labels', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const labels = el.querySelectorAll('.pdx-menu-label');
        expect(labels.length).toBe(1);
        expect(labels[0]?.textContent).toBe('Edit');
    });

    it('renders checkbox items with role=menuitemcheckbox', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const checkboxes = el.querySelectorAll('[role="menuitemcheckbox"]');
        expect(checkboxes.length).toBe(2);
    });

    it('renders checked state on checkbox items', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const bold = el.querySelector('[data-menu-key="bold"]')!;
        expect(bold.getAttribute('aria-checked')).toBe('true');
        const italic = el.querySelector('[data-menu-key="italic"]')!;
        expect(italic.getAttribute('aria-checked')).toBe('false');
    });

    it('renders radio items with role=menuitemradio', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const radios = el.querySelectorAll('[role="menuitemradio"]');
        expect(radios.length).toBe(3);
    });

    it('renders icons', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const icons = el.querySelectorAll('.pdx-menu-icon');
        expect(icons.length).toBe(2);
    });

    it('renders danger items', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const danger = el.querySelector('.pdx-menu-danger');
        expect(danger).toBeTruthy();
        expect(danger?.textContent).toContain('Delete');
    });

    it('renders disabled items', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const disabled = el.querySelector('[data-menu-key="disabled"]') as HTMLButtonElement;
        expect(disabled?.disabled).toBe(true);
    });

    it('renders submenu items with aria-haspopup', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const sub = el.querySelector('[data-menu-key="more"]')!;
        expect(sub.getAttribute('aria-haspopup')).toBe('menu');
        expect(sub.getAttribute('aria-expanded')).toBe('false');
    });

    // ─── Events ──────────────────────────────────────────

    it('emits pdx-select on item click', async () => {
        const el = await mountMenu();
        let detail: any = null;
        el.addEventListener('pdx-select', (e: any) => { detail = e.detail; });

        const item = el.querySelector('[data-menu-key="copy"]') as HTMLElement;
        item.click();
        await tick(50);

        expect(detail).toBeTruthy();
        expect(detail.key).toBe('copy');
    });

    it('emits pdx-check on checkbox toggle', async () => {
        const el = await mountMenu(FULL_ITEMS);
        let detail: any = null;
        el.addEventListener('pdx-check', (e: any) => { detail = e.detail; });

        const italic = el.querySelector('[data-menu-key="italic"]') as HTMLElement;
        italic.click();
        await tick(50);

        expect(detail).toBeTruthy();
        expect(detail.key).toBe('italic');
        expect(detail.checked).toBe(true);
    });

    it('toggles checkbox aria-checked on click', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const bold = el.querySelector('[data-menu-key="bold"]') as HTMLElement;
        expect(bold.getAttribute('aria-checked')).toBe('true');

        bold.click();
        await tick(50);
        expect(bold.getAttribute('aria-checked')).toBe('false');
    });

    it('radio items are mutually exclusive within group', async () => {
        const el = await mountMenu(FULL_ITEMS);
        const small = el.querySelector('[data-menu-key="small"]') as HTMLElement;
        const medium = el.querySelector('[data-menu-key="medium"]') as HTMLElement;

        expect(medium.getAttribute('aria-checked')).toBe('true');

        small.click();
        await tick(50);

        expect(small.getAttribute('aria-checked')).toBe('true');
        expect(medium.getAttribute('aria-checked')).toBe('false');
    });

    // ─── ARIA ────────────────────────────────────────────

    it('menu has role=menu', async () => {
        const el = await mountMenu();
        expect(el.querySelector('[role="menu"]')).toBeTruthy();
    });

    it('items have role=menuitem', async () => {
        const el = await mountMenu();
        const items = el.querySelectorAll('[role="menuitem"]');
        expect(items.length).toBe(3);
    });

    // ─── Visibility ──────────────────────────────────────

    it('hidden when open=false', async () => {
        const el = await mountMenu(BASIC_ITEMS, false);
        expect(el.style.display).toBe('none');
    });

    it('visible when open=true', async () => {
        const el = await mountMenu(BASIC_ITEMS, true);
        expect(el.style.display).not.toBe('none');
    });
});
