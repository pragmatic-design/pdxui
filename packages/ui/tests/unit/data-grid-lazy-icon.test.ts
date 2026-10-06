// pdx-data-grid loads pdx-icon only when it draws one: its empty state, or an action that names
// an icon.
//
// This file is its own module graph: it imports nothing but the grid.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid';

const COLUMNS = [{ field: 'name', header: 'Name' }];

async function mount(data: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-data-grid');
    Object.assign(el, { columns: COLUMNS, data });
    document.body.appendChild(el);
    await tick(200);
    return el;
}

describe('pdx-data-grid and pdx-icon', () => {
    beforeEach(cleanup);

    it('a grid with rows and no named icon never loads pdx-icon', async () => {
        const el = await mount([{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }]);
        expect(el.textContent).toContain('Grace');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for a grid that draws no icon').toBeUndefined();
    });

    it('control — an empty grid shows its icon, and loads it', async () => {
        const el = await mount([]);
        expect(el.querySelector('.pdx-dg-empty-icon pdx-icon')).not.toBeNull();
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});
