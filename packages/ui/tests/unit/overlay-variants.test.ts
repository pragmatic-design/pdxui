// pdx-dialog's size and pdx-sidebar's position are axes (#633): reflected on the host, where the
// design CSS's `@variant` rules key on them, and no longer assembled into classes.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/dialog/pdx-dialog';
import '../../src/sidebar/pdx-sidebar';

describe('pdx-dialog\'s size', () => {
    beforeEach(cleanup);

    it('is reflected, md by default, and leaves no size class on the panel, its root part, open or closed', async () => {
        const plain = await mount('pdx-dialog');
        const big = await mount('pdx-dialog', { size: 'xl', title: 'T' });
        expect([plain.getAttribute('size'), big.getAttribute('size')]).toEqual(['md', 'xl']);
        const panel = () => big.querySelector(':scope > .pdx-dialog-backdrop > [data-part="root"]');
        expect(panel()?.className).toBe('pdx-dialog-panel');
        (big as unknown as { open: boolean }).open = true;
        await tick(50);
        expect(panel()?.className, 'opening does not put it back').toBe('pdx-dialog-panel');
    });
});

describe('pdx-sidebar\'s position', () => {
    beforeEach(cleanup);

    it('is reflected, left by default, and puts no position class on the host', async () => {
        const plain = await mount('pdx-sidebar');
        const right = await mount('pdx-sidebar', { position: 'right' });
        await tick(50);
        expect([plain.getAttribute('position'), right.getAttribute('position')]).toEqual(['left', 'right']);
        // No class at all (#289): sidebar.css draws it from its tag and its states.
        expect(right.getAttribute('class')).toBeNull();
    });
});
