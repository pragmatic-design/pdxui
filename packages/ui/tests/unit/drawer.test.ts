import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/drawer/pdx-drawer';

describe('pdx-drawer', () => {
    beforeEach(cleanup);

    it('renders with backdrop hidden by default', async () => {
        const el = await mount('pdx-drawer');
        const backdrop = el.querySelector('.pdx-drawer-backdrop');
        expect(backdrop).toBeTruthy();
        expect(backdrop?.hasAttribute('data-open')).toBe(false);
    });

    it('opens when open prop set to true', async () => {
        const el = await mount('pdx-drawer');
        (el as any).open = true;
        await tick(50);
        // overlay mode portals the backdrop to <body> on open → query globally.
        const backdrop = document.querySelector('.pdx-drawer-backdrop');
        expect(backdrop?.hasAttribute('data-open')).toBe(true);
    });

    it('closes and emits pdx-close', async () => {
        const el = await mount('pdx-drawer');
        (el as any).open = true;
        await tick(50);

        let closed = false;
        el.addEventListener('pdx-close', () => { closed = true; });

        const closeBtn = document.querySelector('.pdx-drawer-close') as HTMLElement;
        closeBtn?.click();
        await tick();
        expect(closed).toBe(true);
    });

    it('applies position attribute on drawer element', async () => {
        const el = await mount('pdx-drawer', { position: 'left' });
        (el as any).open = true;
        await tick(50);
        const drawer = document.querySelector('.pdx-drawer');
        expect(drawer?.getAttribute('position')).toBe('left');
    });

    it('has correct ARIA attributes', async () => {
        const el = await mount('pdx-drawer', { label: 'Settings' });
        const drawer = el.querySelector('.pdx-drawer');
        expect(drawer?.getAttribute('role')).toBe('dialog');
        expect(drawer?.getAttribute('aria-label')).toBe('Settings');
    });

    it('rAF is cancelled on rapid open/close', async () => {
        const el = await mount('pdx-drawer');
        // Rapid toggle should not throw or leave stale state
        (el as any).open = true;
        (el as any).open = false;
        (el as any).open = true;
        (el as any).open = false;
        await tick(50);
        const backdrop = el.querySelector('.pdx-drawer-backdrop');
        expect(backdrop?.hasAttribute('data-open')).toBe(false);
    });
});
