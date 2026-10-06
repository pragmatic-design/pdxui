// pdx-menubar loads pdx-icon only when an item names an icon.
//
// This file is its own module graph: it imports nothing but the menubar.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/menubar/pdx-menubar';

const SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle></svg>';

/** Mount, then open the first menu: its items are drawn when it opens. */
async function openWith(children: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-menubar');
    Object.assign(el, { items: [{ key: 'file', label: 'File', children }] });
    document.body.appendChild(el);
    await tick(100);
    el.querySelector<HTMLElement>('[role="menuitem"]')?.click();
    await tick(100);
    return el;
}

describe('pdx-menubar and pdx-icon', () => {
    beforeEach(cleanup);

    it('items with SVG icons, or none, never load pdx-icon', async () => {
        await openWith([{ key: 'new', label: 'New', icon: SVG }, { key: 'open', label: 'Open' }]);
        expect(document.body.textContent).toContain('Open');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for items that name no icon').toBeUndefined();
    });

    it('control — an item that names an icon loads it', async () => {
        await openWith([{ key: 'new', label: 'New', icon: 'plus' }]);
        expect(document.querySelector('pdx-icon')?.getAttribute('name')).toBe('plus');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});
