// pdx-badge, pdx-banner, pdx-progress and pdx-toast declare their axes (#631): reflected on the host, where the
// design CSS's `@variant` rules key on them, and no longer assembled into classes on their elements.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/badge/pdx-badge';
import '../../src/banner/pdx-banner';
import '../../src/progress/pdx-progress';
import { toast } from '../../src/toast/pdx-toast';

describe('pdx-badge\'s axes', () => {
    beforeEach(cleanup);

    it('reflects variant, size and shape on the host, the defaults included', async () => {
        const plain = await mount('pdx-badge', { value: '3' });
        const badge = await mount('pdx-badge', { value: '3', variant: 'outline-danger', size: 'sm', shape: 'square' });
        expect(['variant', 'size', 'shape'].map((a) => plain.getAttribute(a))).toEqual(['primary', 'md', 'pill']);
        expect(['variant', 'size', 'shape'].map((a) => badge.getAttribute(a))).toEqual(['outline-danger', 'sm', 'square']);
    });

    it('draws the counter from the host: its root part carries only its base class', async () => {
        const badge = await mount('pdx-badge', { value: '3', variant: 'danger', size: 'lg', shape: 'square' });
        const root = badge.querySelector(':scope > [data-part="root"]');
        expect(root?.className).toBe('pdx-badge');
    });

    it('draws a dot from the host too, `muted` among its values', async () => {
        const dot = await mount('pdx-badge', { dot: '', variant: 'muted' });
        expect(dot.getAttribute('variant')).toBe('muted');
        expect(dot.querySelector(':scope > [data-part="root"]')?.className).toBe('pdx-dot');
    });
});

describe('pdx-banner\'s axis', () => {
    beforeEach(cleanup);

    it('reflects its variant, info by default, error as itself, and puts no class for it on its root', async () => {
        const plain = await mount('pdx-banner');
        const error = await mount('pdx-banner', { variant: 'error' });
        expect([plain.getAttribute('variant'), error.getAttribute('variant')]).toEqual(['info', 'error']);
        const root = error.querySelector(':scope > [data-part="root"]');
        expect(root?.classList.contains('pdx-banner')).toBe(true);
        expect(root?.classList.contains('pdx-banner-danger'), 'drawn from the host now').toBe(false);
    });
});

describe('pdx-progress\'s size axis', () => {
    beforeEach(cleanup);

    it('reflects its size on the host, md by default, on the linear track and on the ring', async () => {
        const plain = await mount('pdx-progress', { value: '40' });
        const linear = await mount('pdx-progress', { value: '40', size: 'sm' });
        const ring = await mount('pdx-progress', { value: '40', size: 'lg', circular: '' });
        await tick(50);
        expect([plain, linear, ring].map((el) => el.getAttribute('size'))).toEqual(['md', 'sm', 'lg']);
        expect(linear.querySelector(':scope > [role="progressbar"] > [data-part="root"].pdx-progress')).not.toBeNull();
        expect(ring.querySelector(':scope > [data-part="root"].pdx-progress-circular')).not.toBeNull();
        expect(linear.querySelector('.pdx-progress-sm, .pdx-progress-lg') ?? ring.querySelector('.pdx-progress-sm, .pdx-progress-lg')).toBeNull();
    });
});

describe('pdx-toast\'s position axis', () => {
    beforeEach(() => {
        cleanup();
        toast.clear();
    });

    it('reflects its position on the host, top-right by default, and leaves it off its container', async () => {
        const plain = await mount('pdx-toast');
        const placed = await mount('pdx-toast', { position: 'bottom-center' });
        toast.info('Saved');
        await tick(50);
        expect([plain.getAttribute('position'), placed.getAttribute('position')]).toEqual(['top-right', 'bottom-center']);
        const container = placed.querySelector(':scope > [data-part="root"]');
        expect(container?.classList.contains('pdx-toast-container')).toBe(true);
        expect(container?.querySelector('.pdx-toast'), 'the toast is rendered into it').not.toBeNull();
        expect(container?.hasAttribute('position'), 'drawn from the host now').toBe(false);
    });
});
