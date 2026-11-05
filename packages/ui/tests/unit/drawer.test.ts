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

    // Open is the model `open` (#288); the state it draws, the host's :state(open), is measured in
    // Chromium (responsive/…/drawer-beta-contract.spec.ts): happy-dom has no custom states.
    it('opens when open prop set to true', async () => {
        const el = await mount('pdx-drawer');
        (el as any).open = true;
        await tick(50);
        expect((el as any).isOpen).toBe(true);
    });

    it('its close button closes it: open-change false, and no pdx-close', async () => {
        const el = await mount('pdx-drawer');
        (el as any).open = true;
        await tick(50);

        const seen: unknown[] = [];
        let alpha = 0;
        el.addEventListener('open-change', (e: Event) => seen.push((e as CustomEvent).detail?.value));
        el.addEventListener('pdx-close', () => { alpha++; });

        const closeBtn = document.querySelector('.pdx-drawer-close') as HTMLElement;
        closeBtn?.click();
        await tick();
        expect((el as any).open).toBe(false);
        expect(seen).toEqual([false]);
        expect(alpha).toBe(0);
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

    // The push-mode backdrop is styled by its own attribute, `.pdx-drawer-backdrop[push]`, not by a
    // sibling combinator from the panel: `.pdx-drawer[push] ~ .pdx-drawer-backdrop` made Chromium keep
    // the removed panel (#891).
    it('marks the backdrop push in push mode, and not in overlay mode', async () => {
        const el = await mount('pdx-drawer', { mode: 'push' });
        (el as any).open = true;
        await tick(50);
        expect(document.querySelector('.pdx-drawer-backdrop')?.hasAttribute('push'), 'push mode: the backdrop is not marked').toBe(true);

        cleanup();
        const overlay = await mount('pdx-drawer', { mode: 'overlay' });
        (overlay as any).open = true;
        await tick(50);
        expect(document.querySelector('.pdx-drawer-backdrop')?.hasAttribute('push'), 'overlay mode: the backdrop is marked push').toBe(false);
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
