// pdx-dropdown-menu follows the APG menu button, and a mis-shaped item says so.
//
// - The builders read an item's kind from `type` only. `{ divider: true }` and `checked` /
//   `radioGroup` with no `type` would make every divider a blank focusable menuitem, and the
//   checkbox/radio items plain menuitems. A .pdx script is not type-checked, so the warning says so.
// - Tab closes the menu; ArrowUp on the trigger opens it; the trigger has aria-controls.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/dropdown-menu/pdx-dropdown-menu';
import '../../src/menu/pdx-menu';
import '../../src/context-menu/pdx-context-menu';
import '../../src/split-button/pdx-split-button';
import '../../src/menubar/pdx-menubar';

async function mountDropdown(items: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-dropdown-menu');
    el.setAttribute('label', 'Options');
    (el as any).items = items;
    document.body.appendChild(el);
    await tick(50);
    return el;
}

const trigger = (el: HTMLElement) => el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
const panel = () => document.querySelector('.pdx-dropdown-menu-panel') as HTMLElement | null;

describe('menu items with the wrong shape warn in dev', () => {
    let warn: Mock<typeof console.warn>;
    beforeEach(() => { cleanup(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => warn.mockRestore());

    const messages = () => warn.mock.calls.map(c => String(c[0]));

    it('a divider item names its key and type: separator', async () => {
        await mountDropdown([{ key: 'a', label: 'A' }, { key: 'x', divider: true }]);
        const hits = messages().filter(m => m.includes('"x"'));
        expect(hits).toHaveLength(1);
        expect(hits[0]).toContain("type: 'separator'");
    });

    it('checked with no type names checkbox; radioGroup with no type names radio', async () => {
        await mountDropdown([
            { key: 'c', label: 'Compact', checked: false },
            { key: 'r', label: 'Grid', radioGroup: 'view', checked: true },
        ]);
        expect(messages().find(m => m.includes('"c"'))).toContain("type: 'checkbox'");
        expect(messages().find(m => m.includes('"r"'))).toContain("type: 'radio'");
    });

    it('well-shaped items do not warn, and a rebuild does not warn again', async () => {
        const items = [
            { key: 'a', label: 'A' },
            { key: 's', label: '', type: 'separator' },
            { key: 'c', label: 'C', type: 'checkbox', checked: true },
            { key: 'r', label: 'R', type: 'radio', radioGroup: 'g', checked: false },
            { key: 'x', divider: true },
        ];
        const el = await mountDropdown(items);
        (el as any).items = items.slice();
        await tick(50);
        expect(messages().filter(m => m.includes('menu item'))).toHaveLength(1);
    });

    it('the four sibling builders warn too', async () => {
        const bad = () => [{ key: 'ok', label: 'Ok' }, { key: 'x', divider: true }];

        const menu = document.createElement('pdx-menu');
        (menu as any).items = bad();
        document.body.appendChild(menu);

        const ctxMenu = document.createElement('pdx-context-menu');
        (ctxMenu as any).items = bad();
        document.body.appendChild(ctxMenu);

        const split = document.createElement('pdx-split-button');
        split.setAttribute('label', 'Save');
        (split as any).items = bad();
        document.body.appendChild(split);

        const bar = document.createElement('pdx-menubar');
        document.body.appendChild(bar);
        await tick(50);
        (bar as any).items = [{ key: 'file', label: 'File', children: bad() }];
        await tick(50);

        (ctxMenu as any).open(20, 20);
        (split.querySelector('.pdx-split-arrow') as HTMLButtonElement).click();
        (bar.querySelector('.pdx-menubar-trigger') as HTMLButtonElement).click();
        await tick(50);

        const tags = messages().filter(m => m.includes('"x"')).map(m => m.slice(0, m.indexOf(']') + 1));
        expect(new Set(tags)).toEqual(new Set(['[pdx-menu]', '[pdx-context-menu]', '[pdx-split-button]', '[pdx-menubar]']));
    });
});

describe('pdx-dropdown-menu — APG menu button keys', () => {
    beforeEach(cleanup);

    const items = [
        { key: 'new', label: 'New' },
        { key: 'open', label: 'Open' },
        { key: 'sep', label: '', type: 'separator' },
        { key: 'del', label: 'Delete' },
        { key: 'arch', label: 'Archive', disabled: true },
    ];

    it('Tab closes the open menu and does not prevent the Tab', async () => {
        const el = await mountDropdown(items);
        (el as any).open();
        await tick();
        const focused = document.activeElement as HTMLElement;
        expect(panel()!.contains(focused)).toBe(true);

        const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        focused.dispatchEvent(ev);

        expect(trigger(el).getAttribute('aria-expanded')).toBe('false');
        expect(panel()).toBeNull();
        expect(ev.defaultPrevented).toBe(false);
        // Focus is back on the trigger, so the browser's Tab moves on from the menu button.
        expect(document.activeElement).toBe(trigger(el));
    });

    it('ArrowUp on the trigger opens with the last enabled item focused', async () => {
        const el = await mountDropdown(items);
        const ev = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
        trigger(el).dispatchEvent(ev);
        await tick();

        expect(ev.defaultPrevented).toBe(true);
        expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
        expect((document.activeElement as HTMLElement).getAttribute('data-menu-key')).toBe('del');
    });

    it('ArrowDown still opens on the first item', async () => {
        const el = await mountDropdown(items);
        trigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        await tick();
        expect((document.activeElement as HTMLElement).getAttribute('data-menu-key')).toBe('new');
    });

    it('the trigger controls the menu while it is open', async () => {
        const el = await mountDropdown(items);
        expect(trigger(el).hasAttribute('aria-controls')).toBe(false);

        (el as any).open();
        await tick();
        const id = trigger(el).getAttribute('aria-controls');
        expect(id).toBeTruthy();
        expect(document.getElementById(id!)).toBe(panel());

        (el as any).close();
        expect(trigger(el).hasAttribute('aria-controls')).toBe(false);
    });

    it('two dropdowns control two different menus', async () => {
        const a = await mountDropdown(items);
        const b = await mountDropdown(items);
        (a as any).open();
        await tick();
        const idA = trigger(a).getAttribute('aria-controls');
        (a as any).close();
        (b as any).open();
        await tick();
        expect(trigger(b).getAttribute('aria-controls')).not.toBe(idA);
    });
});
