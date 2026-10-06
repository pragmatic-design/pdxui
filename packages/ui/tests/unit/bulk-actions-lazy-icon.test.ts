// pdx-bulk-actions loads pdx-icon only when an action names an icon.
//
// This file is its own module graph: it imports nothing but the bulk-actions bar.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/bulk-actions/pdx-bulk-actions';

async function mount(actions: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-bulk-actions');
    Object.assign(el, { count: 2, actions });
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-bulk-actions and pdx-icon', () => {
    beforeEach(cleanup);

    it('actions with labels only never load pdx-icon', async () => {
        const el = await mount([{ key: 'archive', label: 'Archive' }]);
        expect(el.textContent).toContain('Archive');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for actions that name no icon').toBeUndefined();
    });

    it('control — an action that names an icon loads it', async () => {
        const el = await mount([{ key: 'archive', label: 'Archive', icon: 'trash' }]);
        expect(el.querySelector('pdx-icon')?.getAttribute('name')).toBe('trash');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});
