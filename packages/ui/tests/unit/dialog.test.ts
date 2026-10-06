import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/dialog/pdx-dialog';

describe('pdx-dialog', () => {
    beforeEach(cleanup);

    it('renders with backdrop hidden by default', async () => {
        const el = await mount('pdx-dialog');
        const backdrop = el.querySelector('.pdx-dialog-backdrop');
        expect(backdrop).toBeTruthy();
        // data-open should NOT be set when open=false
        expect(backdrop?.hasAttribute('data-open')).toBe(false);
    });

    it('opens when open prop is set to true', async () => {
        const el = await mount('pdx-dialog');
        (el as any).open = true;
        await tick(50);
        const backdrop = el.querySelector('.pdx-dialog-backdrop');
        expect(backdrop?.hasAttribute('data-open')).toBe(true);
    });

    it('imperative API: show() / close() / toggle() / isOpen', async () => {
        const el = await mount('pdx-dialog') as any;
        expect(el.isOpen).toBe(false);
        el.show();
        await tick(50);
        expect(el.isOpen).toBe(true);
        expect(el.querySelector('.pdx-dialog-backdrop')?.hasAttribute('data-open')).toBe(true);
        el.close();
        await tick(50);
        expect(el.isOpen).toBe(false);
        el.toggle();
        await tick(50);
        expect(el.isOpen).toBe(true);
    });

    it('closes when open prop is set to false', async () => {
        const el = await mount('pdx-dialog');
        (el as any).open = true;
        await tick(50);
        (el as any).open = false;
        await tick(50);
        const backdrop = el.querySelector('.pdx-dialog-backdrop');
        expect(backdrop?.hasAttribute('data-open')).toBe(false);
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
        const el = await mount('pdx-dialog');
        (el as any).open = true;
        await tick(50);

        el.addEventListener('pdx-before-close', (e) => { e.preventDefault(); });

        const closeBtn = el.querySelector('.pdx-dialog-close') as HTMLElement;
        if (closeBtn) closeBtn.click();
        await tick(50);

        // Should still be open
        const backdrop = el.querySelector('.pdx-dialog-backdrop');
        expect(backdrop?.hasAttribute('data-open')).toBe(true);
    });

    it('applies size class from prop', async () => {
        const el = await mount('pdx-dialog', { size: 'lg' });
        (el as any).open = true;
        await tick(50);
        const panel = el.querySelector('.pdx-dialog-panel');
        expect(panel?.className).toContain('pdx-dialog-lg');
    });

    it('has role="dialog" and aria-modal="true"', async () => {
        const el = await mount('pdx-dialog');
        const panel = el.querySelector('.pdx-dialog-panel');
        expect(panel?.getAttribute('role')).toBe('dialog');
        expect(panel?.getAttribute('aria-modal')).toBe('true');
    });
});
