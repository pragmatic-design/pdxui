import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/dialog/pdx-dialog';

// Open is the model `open` (#288). The state it draws, the host's :state(open), is measured in Chromium
// (responsive/…/dialog-beta-contract.spec.ts): happy-dom has no custom states.
describe('pdx-dialog', () => {
    beforeEach(cleanup);

    it('renders with backdrop hidden by default', async () => {
        const el = await mount('pdx-dialog') as any;
        const backdrop = el.querySelector('.pdx-dialog-backdrop');
        expect(backdrop).toBeTruthy();
        expect(el.open).toBe(false);
        // The open state is the host's, not an attribute on the backdrop.
        expect(backdrop?.hasAttribute('data-open')).toBe(false);
    });

    it('opens when open prop is set to true', async () => {
        const el = await mount('pdx-dialog') as any;
        el.open = true;
        await tick(50);
        expect(el.isOpen).toBe(true);
    });

    it('imperative API: show() / close() / toggle() / isOpen', async () => {
        const el = await mount('pdx-dialog') as any;
        expect(el.isOpen).toBe(false);
        el.show();
        await tick(50);
        expect(el.isOpen).toBe(true);
        el.close();
        await tick(50);
        expect(el.isOpen).toBe(false);
        el.toggle();
        await tick(50);
        expect(el.isOpen).toBe(true);
    });

    it('closes when open prop is set to false', async () => {
        const el = await mount('pdx-dialog') as any;
        el.open = true;
        await tick(50);
        el.open = false;
        await tick(50);
        expect(el.isOpen).toBe(false);
    });

    it('its close button writes the model: open-change false, and no pdx-close', async () => {
        const el = await mount('pdx-dialog') as any;
        el.open = true;
        await tick(50);
        const seen: unknown[] = [];
        let alpha = 0;
        el.addEventListener('open-change', (e: Event) => seen.push((e as CustomEvent).detail?.value));
        el.addEventListener('pdx-close', () => { alpha++; });
        (el.querySelector('.pdx-dialog-close') as HTMLElement).click();
        await tick(50);
        expect(el.open).toBe(false);
        expect(seen).toEqual([false]);
        expect(alpha).toBe(0);
    });

    it('emits pdx-before-close on tryClose', async () => {
        const el = await mount('pdx-dialog');
        (el as any).open = true;
        await tick(50);

        let beforeCloseEmitted = false;
        el.addEventListener('pdx-before-close', () => { beforeCloseEmitted = true; });

        // Click close button
        const closeBtn = el.querySelector('.pdx-dialog-close') as HTMLElement;
        if (closeBtn) closeBtn.click();
        await tick();

        expect(beforeCloseEmitted).toBe(true);
    });

    it('prevents close when pdx-before-close is cancelled', async () => {
        const el = await mount('pdx-dialog') as any;
        el.open = true;
        await tick(50);

        el.addEventListener('pdx-before-close', (e: Event) => { e.preventDefault(); });

        const closeBtn = el.querySelector('.pdx-dialog-close') as HTMLElement;
        if (closeBtn) closeBtn.click();
        await tick(50);

        // Should still be open
        expect(el.isOpen).toBe(true);
    });

    it('draws its size from the host (#633), on the panel, its root part', async () => {
        const el = await mount('pdx-dialog', { size: 'lg' });
        (el as any).open = true;
        await tick(50);
        expect(el.getAttribute('size')).toBe('lg');
        expect(el.querySelector('.pdx-dialog-panel')?.getAttribute('data-part')).toBe('root');
    });

    it('has role="dialog" and aria-modal="true"', async () => {
        const el = await mount('pdx-dialog');
        const panel = el.querySelector('.pdx-dialog-panel');
        expect(panel?.getAttribute('role')).toBe('dialog');
        expect(panel?.getAttribute('aria-modal')).toBe('true');
    });
});
