// pdx-segmented loads pdx-icon only when an option names an icon.
//
// This file is its own module graph: it imports nothing but the segmented control.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/segmented/pdx-segmented';

async function mount(options: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-segmented');
    Object.assign(el, { options, value: 'a' });
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-segmented and pdx-icon', () => {
    beforeEach(cleanup);

    it('options with labels only never load pdx-icon', async () => {
        const el = await mount([{ value: 'a', label: 'List' }, { value: 'b', label: 'Board' }]);
        expect(el.textContent).toContain('Board');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for options that name no icon').toBeUndefined();
    });

    it('control — an option that names an icon loads it', async () => {
        const el = await mount([{ value: 'a', label: 'List', icon: 'list' }, { value: 'b', label: 'Board' }]);
        expect(el.querySelector('pdx-icon')).not.toBeNull();
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});
