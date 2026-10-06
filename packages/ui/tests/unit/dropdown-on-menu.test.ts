// pdx-dropdown-menu draws its list with pdx-menu, and pdx-menu grows what that needs.
//
// A dropdown carrying its OWN copy of the menu — items, submenus, keys — would let the two copies
// diverge, and a fix to one would have to be written in each. That copy would also be most of the
// dropdown's 3.5 KB in the first paint; the icons and the string registry are there anyway.
//
// So the dropdown keeps its trigger, its placement, opening and closing, and the list is pdx-menu's.
// What pdx-menu does for it:
//   - an item's icon given by NAME (the dropdown's items use `icon: 'copy'`), not drawn as text;
//     `pdx-icon` is loaded the first time one is named, so a menu of SVG icons never loads it;
//   - `menuId`, the id a trigger's `aria-controls` points at, on the element that is `role="menu"`;
//   - `renderItem`, the dropdown's `item` slot handed on to the menu it builds.
//
// This file is its own module graph, so whether `pdx-icon` is registered is this file's to say.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/menu/pdx-menu';
import '../../src/dropdown-menu/pdx-dropdown-menu';

const SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle></svg>';

async function mountMenu(items: unknown[], extra: Record<string, unknown> = {}): Promise<HTMLElement> {
    const el = document.createElement('pdx-menu');
    Object.assign(el, { items, ...extra });
    el.setAttribute('open', '');
    document.body.appendChild(el);
    await tick(50);
    return el;
}

describe('pdx-menu, for the dropdown', () => {
    beforeEach(cleanup);

    it('control — a menu of SVG icons draws them and never loads pdx-icon', async () => {
        const el = await mountMenu([{ key: 'a', label: 'A', icon: SVG }]);
        expect(el.querySelector('.pdx-menu-icon svg')).not.toBeNull();
        expect(customElements.get('pdx-icon'), 'pdx-icon was loaded for a menu that names no icon').toBeUndefined();
    });

    it('an icon given by NAME is a pdx-icon, and pdx-icon is loaded for it', async () => {
        const el = await mountMenu([{ key: 'copy', label: 'Duplicate', icon: 'copy' }]);
        const icon = el.querySelector('pdx-icon.pdx-menu-icon');
        expect(icon, 'the name was drawn as text').not.toBeNull();
        expect(icon!.getAttribute('name')).toBe('copy');
        await tick(100);
        expect(customElements.get('pdx-icon'), 'pdx-icon is never registered').toBeDefined();
    });

    it('menuId is the id of the element that is role="menu"', async () => {
        const el = await mountMenu([{ key: 'a', label: 'A' }], { menuId: 'the-menu' });
        const menu = el.querySelector('[role="menu"]');
        expect(menu?.id).toBe('the-menu');
    });

    it('renderItem draws an entry, as the item slot does', async () => {
        const renderItem = ({ item }: { item: { label: string } }) => {
            const b = document.createElement('b');
            b.textContent = `«${item.label}»`;
            return b;
        };
        const el = await mountMenu([{ key: 'a', label: 'A' }], { renderItem });
        expect(el.querySelector('[data-menu-key="a"] b')?.textContent).toBe('«A»');
    });
});

describe('pdx-dropdown-menu, on pdx-menu', () => {
    beforeEach(cleanup);

    it('its panel IS a pdx-menu, not a copy of one', async () => {
        const el = document.createElement('pdx-dropdown-menu');
        el.setAttribute('label', 'Actions');
        (el as any).items = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
        document.body.appendChild(el);
        await tick(50);
        (el as any).open();
        await tick(50);

        // The panel is still the element that is the menu — what apps and the certification select
        // by — and it is drawn by a pdx-menu, not by a copy of one.
        const panel = document.querySelector('.pdx-dropdown-menu-panel');
        expect(panel?.getAttribute('role')).toBe('menu');
        expect(panel?.parentElement?.localName, 'the dropdown still builds its own list').toBe('pdx-menu');
        // And the trigger controls it.
        const trigger = el.querySelector('button[aria-haspopup="menu"]')!;
        expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toBe(panel);
    });
});
