import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import { dialog } from '../../src/dialog/dialog-service';
import '../../src/overlay/pdx-overlay-outlet';

describe('pdx-overlay-outlet', () => {
    beforeEach(cleanup);

    it('renders empty container', async () => {
        const el = await mount('pdx-overlay-outlet');
        const container = el.querySelector('.pdx-overlay-container');
        expect(container).toBeTruthy();
        expect(container?.children.length).toBe(0);
    });

    it('dialog.confirm creates a dialog in the outlet', async () => {
        await mount('pdx-overlay-outlet');
        const p = dialog.confirm({ title: 'Test Confirm', message: 'Are you sure?' });
        await tick(50);

        const dialogs = document.querySelectorAll('[data-dialog-id]');
        expect(dialogs.length).toBe(1);
        expect(dialogs[0]?.querySelector('.pdx-dialog-header')?.textContent).toContain('Test Confirm');

        // Close it
        dialog.closeAll();
        const result = await p;
        expect(result).toBeUndefined();
    });

    it('dialog.alert creates an alert with OK button', async () => {
        await mount('pdx-overlay-outlet');
        const p = dialog.alert({ title: 'Info', message: 'Done.' });
        await tick(50);

        const okBtn = document.querySelector('.pdx-alert-ok');
        expect(okBtn).toBeTruthy();
        expect(okBtn?.textContent).toBe('OK');

        (okBtn as HTMLElement)?.click();
        await tick();
        await p;
    });

    it('confirm dialog uses role="alertdialog"', async () => {
        await mount('pdx-overlay-outlet');
        dialog.confirm({ title: 'Test' });
        await tick(50);

        const panel = document.querySelector('[data-dialog-id] .pdx-dialog-panel');
        expect(panel?.getAttribute('role')).toBe('alertdialog');

        dialog.closeAll();
    });

    it('generic dialog uses role="dialog"', async () => {
        await mount('pdx-overlay-outlet');
        dialog.open({ title: 'Generic' });
        await tick(50);

        const panel = document.querySelector('[data-dialog-id] .pdx-dialog-panel');
        expect(panel?.getAttribute('role')).toBe('dialog');

        dialog.closeAll();
    });

    it('confirm resolves true on confirm click', async () => {
        await mount('pdx-overlay-outlet');
        const p = dialog.confirm({ title: 'Save?', confirmLabel: 'Save' });
        await tick(50);

        const confirmBtn = document.querySelector('.pdx-alert-confirm') as HTMLElement;
        confirmBtn?.click();
        await tick();

        expect(await p).toBe(true);
    });

    it('confirm resolves false on cancel click', async () => {
        await mount('pdx-overlay-outlet');
        const p = dialog.confirm({ title: 'Save?' });
        await tick(50);

        const cancelBtn = document.querySelector('.pdx-alert-cancel') as HTMLElement;
        cancelBtn?.click();
        await tick();

        expect(await p).toBe(false);
    });

    it('type-to-confirm disables button until text matches', async () => {
        await mount('pdx-overlay-outlet');
        dialog.confirm({ title: 'Delete?', confirmText: 'delete' });
        await tick(50);

        const confirmBtn = document.querySelector('.pdx-alert-confirm') as HTMLButtonElement;
        expect(confirmBtn?.disabled).toBe(true);

        const input = document.querySelector('[data-dialog-id] input') as HTMLInputElement;
        input.value = 'delete';
        input.dispatchEvent(new Event('input'));
        await tick();

        expect(confirmBtn?.disabled).toBe(false);

        dialog.closeAll();
    });

    it('does not use innerHTML for user content (XSS safe)', async () => {
        await mount('pdx-overlay-outlet');
        dialog.confirm({
            title: '<script>alert(1)</script>',
            message: '<img onerror=alert(1)>',
            confirmText: '<b>bold</b>',
        });
        await tick(50);

        // Title should be text, not HTML
        const header = document.querySelector('.pdx-dialog-header span');
        expect(header?.textContent).toContain('<script>');
        expect(header?.innerHTML).not.toContain('<script>alert');

        // Message should be textContent
        const msg = document.querySelector('[data-dialog-id] .pdx-dialog-body p');
        expect(msg?.textContent).toContain('<img');

        dialog.closeAll();
    });
});
