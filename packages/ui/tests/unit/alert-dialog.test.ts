import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/alert-dialog/pdx-alert-dialog';

describe('pdx-alert-dialog', () => {
    beforeEach(cleanup);

    it('renders with backdrop hidden by default', async () => {
        const el = await mount('pdx-alert-dialog');
        const backdrop = el.querySelector('.pdx-dialog-backdrop');
        expect(backdrop).toBeTruthy();
        expect(backdrop?.hasAttribute('data-open')).toBe(false);
    });

    it('opens when open prop set to true', async () => {
        const el = await mount('pdx-alert-dialog');
        (el as any).open = true;
        await tick(50);
        const backdrop = el.querySelector('.pdx-dialog-backdrop');
        expect(backdrop?.hasAttribute('data-open')).toBe(true);
    });

    it('has role="alertdialog"', async () => {
        const el = await mount('pdx-alert-dialog');
        const panel = el.querySelector('.pdx-dialog-panel');
        expect(panel?.getAttribute('role')).toBe('alertdialog');
    });

    it('emits pdx-confirm when confirm button clicked', async () => {
        const el = await mount('pdx-alert-dialog');
        (el as any).open = true;
        await tick(50);

        let confirmed = false;
        el.addEventListener('pdx-confirm', () => { confirmed = true; });

        const confirmBtn = el.querySelector('.pdx-alert-confirm') as HTMLElement;
        confirmBtn?.click();
        await tick();
        expect(confirmed).toBe(true);
    });

    it('emits pdx-cancel when cancel button clicked', async () => {
        const el = await mount('pdx-alert-dialog');
        (el as any).open = true;
        await tick(50);

        let cancelled = false;
        el.addEventListener('pdx-cancel', () => { cancelled = true; });

        const cancelBtn = el.querySelector('.pdx-alert-cancel') as HTMLElement;
        cancelBtn?.click();
        await tick();
        expect(cancelled).toBe(true);
    });

    it('danger variant applies pdx-danger class', async () => {
        const el = await mount('pdx-alert-dialog', { variant: 'danger' });
        (el as any).open = true;
        await tick(50);
        const confirmBtn = el.querySelector('.pdx-alert-confirm');
        expect(confirmBtn?.className).toContain('pdx-danger');
    });
});

// Reopening type-to-confirm starts from an empty field, and the message is the dialog's
// description. (The focus half is measured in Chromium, site
// modal-focus.spec.ts: a click moving focus is a browser behaviour happy-dom does not have.)
describe('pdx-alert-dialog reopened, and described', () => {
    beforeEach(cleanup);

    it('type-to-confirm: reopened after a confirm, the field is empty and confirm is disabled', async () => {
        const el = await mount('pdx-alert-dialog', { 'confirm-text': 'DELETE' }) as HTMLElement & { open: boolean };
        el.open = true;
        await tick(50);
        const input = () => el.querySelector('.pdx-alert-type-input') as HTMLInputElement;
        const confirmBtn = () => el.querySelector('.pdx-alert-confirm') as HTMLButtonElement;
        input().value = 'DELETE';
        input().dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(confirmBtn().disabled, 'typing the text did not enable confirm').toBe(false);
        confirmBtn().click();
        await tick(50);

        el.open = true;
        await tick(50);
        expect(input().value, 'the field kept the text of the last time').toBe('');
        expect(confirmBtn().disabled).toBe(true);
    });

    it('the panel\'s aria-describedby resolves to the message', async () => {
        const el = await mount('pdx-alert-dialog', { title: 'Delete it?', message: 'This cannot be undone.' });
        const panel = el.querySelector('.pdx-dialog-panel')!;
        const id = panel.getAttribute('aria-describedby');
        expect(id, 'the panel has no aria-describedby').toBeTruthy();
        expect(document.getElementById(id!)?.textContent).toBe('This cannot be undone.');
    });

    it('the control: no message, no aria-describedby pointing at nothing', async () => {
        const el = await mount('pdx-alert-dialog', { title: 'Delete it?' });
        expect(el.querySelector('.pdx-dialog-panel')!.hasAttribute('aria-describedby')).toBe(false);
    });

    it('two dialogs describe themselves with ids of their own', async () => {
        document.body.innerHTML = `
            <pdx-alert-dialog title="A" message="first"></pdx-alert-dialog>
            <pdx-alert-dialog title="B" message="second"></pdx-alert-dialog>`;
        await tick(50);
        const texts = [...document.querySelectorAll('.pdx-dialog-panel')]
            .map((p) => document.getElementById(p.getAttribute('aria-describedby')!)?.textContent);
        expect(texts).toEqual(['first', 'second']);
    });
});
