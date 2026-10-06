// pdx-description-list loads pdx-icon only when an item names an icon.
//
// This file is its own module graph: it imports nothing but the description list.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/description-list/pdx-description-list';

async function mount(items: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-description-list');
    Object.assign(el, { items });
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-description-list and pdx-icon', () => {
    beforeEach(cleanup);

    it('terms without icons never load pdx-icon', async () => {
        const el = await mount([{ label: 'Status', value: 'Open' }]);
        expect(el.textContent).toContain('Open');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for terms that name no icon').toBeUndefined();
    });

    it('control — a term that names an icon loads it', async () => {
        const el = await mount([{ label: 'Status', value: 'Open', icon: 'info' }]);
        expect(el.querySelector('pdx-icon')?.getAttribute('name')).toBe('info');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});
