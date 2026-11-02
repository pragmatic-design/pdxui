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

    it('loading is no class on its inner button (#291): it is aria-busy, and :state(loading) in a browser', async () => {
        // happy-dom has no custom states: button-beta-contract.spec.ts measures :state(loading) in Chromium.
        const busy = await mount('pdx-button', { loading: '' });
        await tick();
        expect(busy.querySelector('button')?.className).toBe('pdx-button');
        expect(busy.querySelector('button')?.getAttribute('aria-busy')).toBe('true');
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

    it('has no toggle mode (#291): toggle and pressed do nothing, a click flips no state and announces no pdx-toggle', async () => {
        // The on/off button is pdx-toggle; `pdx migrate` rewrites a `<pdx-button toggle>` to it.
        const el = await mount('pdx-button', { toggle: '', pressed: '' });
        let toggled = false;
        el.addEventListener('pdx-toggle', () => { toggled = true; });
        await tick();
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const btn = el.querySelector('button');
        btn?.click();
        await tick();
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        expect(btn?.hasAttribute('aria-pressed')).toBe(false);
        expect(btn?.className).toBe('pdx-button');
        expect(toggled).toBe(false);
    });
});
