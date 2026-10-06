// pdx-menu updates in place an items array that changes only `checked`, `disabled` or a label.
//
// Rebuilding the whole menu for every new `items` array means new elements under the pointer, the
// focus carried across by key but the element it was on gone — and an app that keeps its `checked`
// out of reactivity, patching the objects before each opening, rather than hand the menu a new array
// for a radio that moved. A new array with the same keys and the same shape is reconciled, not
// rebuilt.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/menu/pdx-menu';

type Item = { key: string; label: string; type?: string; radioGroup?: string; checked?: boolean; disabled?: boolean; children?: Item[] };

const settings = (scheme: 'light' | 'dark', compactDisabled = false): Item[] => [
    { key: 'light', label: 'Light', type: 'radio', radioGroup: 'scheme', checked: scheme === 'light' },
    { key: 'dark', label: 'Dark', type: 'radio', radioGroup: 'scheme', checked: scheme === 'dark' },
    { key: 'sep', label: '', type: 'separator' },
    { key: 'compact', label: 'Compact', type: 'checkbox', checked: false, disabled: compactDisabled },
    { key: 'signout', label: 'Sign out' },
];

async function mountMenu(items: Item[]): Promise<HTMLElement & { items: Item[] }> {
    const el = document.createElement('pdx-menu') as HTMLElement & { items: Item[] };
    el.items = items;
    el.setAttribute('open', '');
    document.body.appendChild(el);
    await tick(80);
    return el;
}

const item = (el: HTMLElement, key: string) => el.querySelector(`[data-menu-key="${key}"]`) as HTMLElement;

describe('pdx-menu — a new array with the same shape updates in place', () => {
    beforeEach(cleanup);

    it('a radio that moves: the same elements, the focus kept, the new check shown', async () => {
        const el = await mountMenu(settings('light'));
        const before = Array.from(el.querySelectorAll('.pdx-menu > *'));
        item(el, 'dark').focus();

        el.items = settings('dark');
        await tick(80);

        const after = Array.from(el.querySelectorAll('.pdx-menu > *'));
        expect(after.length).toBe(before.length);
        expect(after.every((node, i) => node === before[i]), 'the menu was rebuilt: new elements under the pointer').toBe(true);
        expect(document.activeElement, 'the focus left the item it was on').toBe(item(el, 'dark'));
        expect(item(el, 'dark').getAttribute('aria-checked')).toBe('true');
        expect(item(el, 'light').getAttribute('aria-checked')).toBe('false');
    });

    it('disabled and a label follow in place too', async () => {
        const el = await mountMenu(settings('light'));
        const compact = item(el, 'compact');
        const next = settings('light', true);
        next[4] = { ...next[4], label: 'Log out' };

        el.items = next;
        await tick(80);

        expect(item(el, 'compact')).toBe(compact);
        expect((item(el, 'compact') as HTMLButtonElement).disabled).toBe(true);
        expect(item(el, 'signout').textContent).toContain('Log out');
    });

    it('the events carry the CURRENT item, not the one the menu was first drawn from', async () => {
        const el = await mountMenu(settings('light'));
        el.items = settings('dark');
        await tick(80);

        let detail: { key: string; checked: boolean; item: Item } | null = null;
        el.addEventListener('pdx-check', (e) => { detail = (e as CustomEvent).detail; });
        item(el, 'compact').click();
        expect(detail!.key).toBe('compact');
        expect(detail!.item, 'the event carried the first array\'s object').toBe(el.items[3]);
    });

    it('control — a structural change still rebuilds: a new key', async () => {
        const el = await mountMenu(settings('light'));
        const signout = item(el, 'signout');
        el.items = [...settings('light'), { key: 'help', label: 'Help' }];
        await tick(80);
        expect(item(el, 'help')).not.toBeNull();
        expect(item(el, 'signout'), 'a structural change was patched instead of rebuilt').not.toBe(signout);
    });

    it('control — a changed type still rebuilds', async () => {
        const el = await mountMenu(settings('light'));
        const compact = item(el, 'compact');
        const next = settings('light');
        next[3] = { key: 'compact', label: 'Compact' };
        el.items = next;
        await tick(80);
        expect(item(el, 'compact')).not.toBe(compact);
        expect(item(el, 'compact').getAttribute('role')).toBe('menuitem');
    });
});
