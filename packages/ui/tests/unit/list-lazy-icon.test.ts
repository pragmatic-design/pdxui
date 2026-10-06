// pdx-list loads pdx-icon only when its empty state shows.
//
// The list draws one icon, the empty state's. A static import of `../icon/pdx-icon` for it brings
// the whole icon set, 16.3 KB gzip of the showcase's first paint, into a dashboard list that has
// rows and so never shows the icon.
//
// This file is its own module graph, so whether `pdx-icon` is registered is this file's to say:
// it imports nothing but the list.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/list/pdx-list';

async function mount(items: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-list');
    Object.assign(el, { items });
    document.body.appendChild(el);
    await tick(100);
    return el;
}

describe('pdx-list and pdx-icon', () => {
    beforeEach(cleanup);

    it('a list with rows never loads pdx-icon', async () => {
        const el = await mount([{ id: 1, label: 'One' }, { id: 2, label: 'Two' }]);
        expect(el.querySelector('.pdx-list')?.children.length).toBeGreaterThan(0);
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for a list with rows').toBeUndefined();
    });

    it('control — an empty list shows its icon, and loads it', async () => {
        const el = await mount([]);
        expect(el.querySelector('.pdx-list-empty pdx-icon')).not.toBeNull();
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});
