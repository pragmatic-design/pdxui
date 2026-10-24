// pdx-chip and pdx-fab declare their axes (#630): reflected on the host, where the design CSS's
// `@variant` rules key on them, and no longer assembled into classes on their own elements. The
// components that only forward an axis — pdx-button-group, pdx-toggle, pdx-split-button,
// pdx-dropdown-menu — keep it as a plain prop (owner's decision on #630).
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/chip/pdx-chip';
import '../../src/fab/pdx-fab';

describe('pdx-chip\'s axes', () => {
    beforeEach(cleanup);

    it('reflects its variant and size on the host, the defaults included', async () => {
        const plain = await mount('pdx-chip', { label: 'A' });
        const chip = await mount('pdx-chip', { label: 'A', variant: 'tonal-success', size: 'sm' });
        expect([plain.getAttribute('variant'), plain.getAttribute('size')]).toEqual(['outline', 'md']);
        expect([chip.getAttribute('variant'), chip.getAttribute('size')]).toEqual(['tonal-success', 'sm']);
    });

    it('draws them from the host: its root part carries no class for them', async () => {
        const chip = await mount('pdx-chip', { label: 'A', variant: 'danger', size: 'lg' });
        const root = chip.querySelector(':scope > [data-part="root"]');
        expect(root, 'the root part the @variant rules key on').not.toBeNull();
        expect(root!.classList.contains('pdx-chip'), 'the base class stays').toBe(true);
        expect([root!.classList.contains('pdx-chip-danger'), root!.classList.contains('pdx-chip-lg')]).toEqual([false, false]);
    });
});

describe('pdx-fab\'s axes', () => {
    beforeEach(cleanup);

    it('reflects its variant, size and position on the host, the defaults included', async () => {
        const plain = await mount('pdx-fab');
        const fab = await mount('pdx-fab', { variant: 'danger', size: 'lg', position: 'top-left' });
        expect(['variant', 'size', 'position'].map((a) => plain.getAttribute(a))).toEqual(['primary', 'md', 'bottom-right']);
        expect(['variant', 'size', 'position'].map((a) => fab.getAttribute(a))).toEqual(['danger', 'lg', 'top-left']);
    });

    it('draws them from the host: no class for them on the host or on its button', async () => {
        const fab = await mount('pdx-fab', { variant: 'secondary', size: 'sm', position: 'top-right' });
        await tick(50);
        const button = fab.querySelector(':scope > [data-part="root"]');
        expect(button?.classList.contains('pdx-fab'), 'the root part, with its base class').toBe(true);
        expect([button!.classList.contains('pdx-fab-secondary'), button!.classList.contains('pdx-fab-sm')]).toEqual([false, false]);
        expect(fab.classList.contains('pdx-fab-top-right'), 'the position is the host\'s attribute').toBe(false);
        expect(fab.classList.contains('pdx-fab-container'), 'the container class stays').toBe(true);
    });
});
