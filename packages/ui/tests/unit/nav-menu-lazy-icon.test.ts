// pdx-nav-menu loads pdx-icon only when an item names an icon.
//
// `../icon/pdx-icon` — and with it the whole icon set — is needed only for items whose `icon` is a
// NAME. Imported statically, a menu drawn with SVG icons, or with none, pays for the set anyway.
// pdx-menu and pdx-dropdown-menu follow the same rule.
//
// This file is its own module graph, so whether `pdx-icon` is registered is this file's to say:
// it imports nothing but the nav menu.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/nav-menu/pdx-nav-menu';

const SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle></svg>';

async function mount(items: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-nav-menu');
    (el as any).items = items;
    document.body.appendChild(el);
    await tick(50);
    return el;
}

describe('pdx-nav-menu and pdx-icon', () => {
    beforeEach(cleanup);

    it('a menu of SVG icons never loads pdx-icon', async () => {
        const el = await mount([{ key: 'a', label: 'A', icon: SVG }, { key: 'b', label: 'B' }]);
        expect(el.querySelector('.pdx-nav-icon svg')).not.toBeNull();
        await tick(50);
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for a menu that names no icon').toBeUndefined();
    });

    it('an icon given by NAME loads it, and the entry shows it', async () => {
        const el = await mount([{ key: 'a', label: 'A', icon: 'home' }]);
        const icon = el.querySelector('pdx-icon.pdx-nav-icon');
        expect(icon?.getAttribute('name')).toBe('home');
        await tick(100);
        expect(customElements.get('pdx-icon')).toBeDefined();
    });
});
