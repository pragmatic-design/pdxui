// pdx-context-menu loads pdx-icon only when an item names an icon.
//
// This file is its own module graph: it imports nothing but the context menu.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/context-menu/pdx-context-menu';

const SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle></svg>';

async function openWith(items: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-context-menu');
    Object.assign(el, { items });
    document.body.appendChild(el);
    await tick(100);
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick(100);
    return el;
}

describe('pdx-context-menu and pdx-icon', () => {
    beforeEach(cleanup);

    it('items with SVG icons, or none, never load pdx-icon', async () => {
        await openWith([{ key: 'a', label: 'Copy', icon: SVG }, { key: 'b', label: 'Paste' }]);
        expect(document.body.textContent).toContain('Paste');
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for items that name no icon').toBeUndefined();
    });

    it('control — an item that names an icon loads it', async () => {
        await openWith([{ key: 'a', label: 'Copy', icon: 'copy' }]);
        expect(document.querySelector('pdx-icon')?.getAttribute('name')).toBe('copy');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});
