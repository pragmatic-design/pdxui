import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/button/pdx-button';

describe('pdx-button', () => {
    beforeEach(cleanup);

    it('puts no variant class on its inner button: the host carries the variant (#512)', async () => {
        const plain = await mount('pdx-button');
        const danger = await mount('pdx-button', { variant: 'danger' });
        expect(plain.querySelector('button')).toBeTruthy();
        // `pdx-button` is the root's base class, the same for every variant: it keeps the button
        // under the design system's reset of a host's bare element rules (`[class*="pdx-"]`).
        expect([plain.querySelector('button')?.className, danger.querySelector('button')?.className]).toEqual(['pdx-button', 'pdx-button']);
        expect([plain.getAttribute('variant'), danger.getAttribute('variant')]).toEqual(['primary', 'danger']);
    });

    it('keeps the state classes, loading and pressed, on its inner button', async () => {
        const busy = await mount('pdx-button', { loading: '' });
        await tick();
        expect(busy.querySelector('button')?.className).toBe('pdx-button pdx-loading');
        const toggle = await mount('pdx-button', { toggle: '', pressed: '' });
        await tick();
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        expect(toggle.querySelector('button')?.className).toBe('pdx-button pdx-pressed');
    });

    it('reflects its variant and size on the host, the defaults included (#512)', async () => {
        const plain = await mount('pdx-button');
        expect([plain.getAttribute('variant'), plain.getAttribute('size')]).toEqual(['primary', 'md']);
        const ghost = await mount('pdx-button', { variant: 'ghost', size: 'sm' });
        expect([ghost.getAttribute('variant'), ghost.getAttribute('size')]).toEqual(['ghost', 'sm']);
        expect(ghost.querySelector('button')?.getAttribute('data-part'), 'the root part the @variant rules key on').toBe('root');
        expect(ghost.querySelector('button')?.getAttribute('size'), 'the native size is kept on the inner button').toBe('sm');
        expect(plain.querySelector('button')?.hasAttribute('size'), 'md is the native default: no attribute').toBe(false);
    });

    it('a variant outside the axis reflects the default', async () => {
        const el = await mount('pdx-button', { variant: 'fancy' });
        await tick();
        expect(el.getAttribute('variant')).toBe('primary');
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
