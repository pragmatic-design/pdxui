// Two instances of a component never share an id, whatever Math.random returns.
//
// pdx-command, pdx-nav-menu and pdx-radio-group built their ids from Math.random (#68, code scanning
// alerts #140, #141; radio-group the same pattern, unreported). A random id can repeat, and where
// these ids go a repeat breaks something: the palette's key in the overlay stack (one closes the
// other), a group's aria-controls target, the shared `name` of a radio group (selecting in one
// deselects the other). Every other component counts its instances; these three do now.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/command/pdx-command';
import '../../src/nav-menu/pdx-nav-menu';
import '../../src/radio-group/pdx-radio-group';
import '../../src/radio/pdx-radio';

beforeEach(() => {
    cleanup();
    // The worst case of a random id, made certain: the same "random" for every instance.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => vi.restoreAllMocks());

describe('ids are unique per instance', () => {
    it('pdx-command: two palettes, two list ids', async () => {
        document.body.innerHTML = '<pdx-command></pdx-command><pdx-command></pdx-command>';
        await tick();
        const palettes = [...document.querySelectorAll('pdx-command')] as (HTMLElement & { show(): void; items: unknown[] })[];
        for (const p of palettes) { p.items = [{ id: 'a', label: 'A' }]; p.show(); }
        await tick(30);
        const ids = palettes.map((p) => p.querySelector('[role="listbox"]')?.id);
        expect(ids[0], 'the palette has no listbox id').toBeTruthy();
        expect(ids[0]).not.toBe(ids[1]);
    });

    it('pdx-nav-menu: two menus, two group ids for the same key', async () => {
        const items = [{ key: 'work', type: 'header', label: 'Work', children: [{ key: 'a', label: 'A', href: '/a' }] }];
        const menus = [document.createElement('pdx-nav-menu'), document.createElement('pdx-nav-menu')];
        for (const m of menus) { (m as unknown as { items: unknown }).items = items; document.body.appendChild(m); }
        await tick(50);
        const controls = menus.map((m) => m.querySelector('[data-nav-key="work"]')?.getAttribute('aria-controls'));
        expect(controls[0], 'the group heading controls nothing').toBeTruthy();
        expect(controls[0]).not.toBe(controls[1]);
    });

    it('pdx-radio-group: two unnamed groups, two radio names', async () => {
        document.body.innerHTML = [
            '<pdx-radio-group><pdx-radio value="a" label="A"></pdx-radio></pdx-radio-group>',
            '<pdx-radio-group><pdx-radio value="a" label="A"></pdx-radio></pdx-radio-group>',
        ].join('');
        await tick(30);
        const names = [...document.querySelectorAll('pdx-radio-group')].map((g) => g.querySelector('input[type="radio"]')?.getAttribute('name'));
        expect(names[0], 'the radio has no name').toBeTruthy();
        expect(names[0]).not.toBe(names[1]);
    });
});
