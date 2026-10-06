import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/button/pdx-button';

describe('pdx-button', () => {
    beforeEach(cleanup);

    it('renders with default variant (primary)', async () => {
        const el = await mount('pdx-button');
        const btn = el.querySelector('button');
        expect(btn).toBeTruthy();
        expect(btn?.className).toContain('pdx-primary');
    });

    it('applies variant class', async () => {
        const el = await mount('pdx-button', { variant: 'danger' });
        const btn = el.querySelector('button');
        expect(btn?.className).toContain('pdx-danger');
    });

    it('disabled prop disables the button', async () => {
        const el = await mount('pdx-button', { disabled: '' });
        await tick();
        const btn = el.querySelector('button');
        expect(btn?.disabled).toBe(true);
    });

    it('toggle mode: click toggles pressed state', async () => {
        const el = await mount('pdx-button', { toggle: '' });
        await tick();
        const btn = el.querySelector('button');

        btn?.click();
        await tick();
        expect(btn?.getAttribute('aria-pressed')).toBe('true');

        btn?.click();
        await tick();
        expect(btn?.getAttribute('aria-pressed')).toBe('false');
    });

    it('toggle mode: pressed prop controls state externally', async () => {
        const el = await mount('pdx-button', { toggle: '', pressed: '' });
        await tick();
        const btn = el.querySelector('button');
        expect(btn?.getAttribute('aria-pressed')).toBe('true');
    });

    it('emits pdx-toggle on toggle button click', async () => {
        const el = await mount('pdx-button', { toggle: '' });
        let toggled = false;
        el.addEventListener('pdx-toggle', () => { toggled = true; });
        const btn = el.querySelector('button');
        btn?.click();
        await tick();
        expect(toggled).toBe(true);
    });

    it('loading state adds pdx-loading class', async () => {
        const el = await mount('pdx-button', { loading: '' });
        await tick();
        const btn = el.querySelector('button');
        expect(btn?.className).toContain('pdx-loading');
    });
});
