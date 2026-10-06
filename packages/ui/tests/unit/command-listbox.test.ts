// pdx-command: the highlighted command is announced through aria-activedescendant, the input is the
// list's one tab stop, groups are named groups, a disabled command is shown and skipped, and a
// shortcut is a key shortcut rather than part of the name.
//
// Focus stays in the input while the arrows move the highlight, so the input carries
// aria-activedescendant and the options an id: otherwise arrowing announces nothing. The options are
// not <button>s, which Tab would walk through one by one. Disabled commands stay in the list, and the
// shortcut text ("Ctrl P") is not read as part of each command's name.
import { describe, it, expect, beforeEach } from 'vitest';
import { html, slotCarrier } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/command/pdx-command';

type Cmd = HTMLElement & { show(): void; items: unknown[] };

const ITEMS = [
    { id: 'dash', label: 'Go to Dashboard', group: 'Navigate' },
    { id: 'team', label: 'Manage Team', group: 'Navigate' },
    { id: 'archive', label: 'Archive Project', group: 'Navigate', disabled: true },
    { id: 'search', label: 'Search Projects', group: 'Navigate', shortcut: 'Ctrl P' },
    { id: 'settings', label: 'Settings', group: 'Account', shortcut: 'Ctrl Shift ,' },
];

async function openPalette(items: unknown[] = ITEMS): Promise<{ el: Cmd; input: HTMLInputElement }> {
    document.body.innerHTML = '<pdx-command></pdx-command>';
    await tick();
    const el = document.querySelector('pdx-command') as Cmd;
    el.items = items;
    el.show();
    await tick(30);
    return { el, input: el.querySelector('input') as HTMLInputElement };
}
const key = (input: HTMLInputElement, k: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const active = (el: Cmd, input: HTMLInputElement): HTMLElement | null => {
    const id = input.getAttribute('aria-activedescendant');
    return id ? el.querySelector(`[id="${id}"]`) : null;
};
const optionText = (o: Element | null) => o?.querySelector('.pdx-command-item-label')?.textContent?.trim() ?? o?.textContent?.trim();

beforeEach(cleanup);

describe('the highlight is announced', () => {
    it('opening points aria-activedescendant at the first command; ArrowDown twice at the third enabled one', async () => {
        const { el, input } = await openPalette();
        expect(optionText(active(el, input))).toBe('Go to Dashboard');
        key(input, 'ArrowDown');
        key(input, 'ArrowDown');
        await tick();
        const opt = active(el, input);
        expect(opt?.getAttribute('role')).toBe('option');
        // "Archive Project" is disabled: the arrows step over it.
        expect(optionText(opt)).toBe('Search Projects');
        expect(opt?.getAttribute('aria-selected')).toBe('true');
    });

    it('typing a filter moves aria-activedescendant to the first match; no match clears it', async () => {
        const { el, input } = await openPalette();
        input.value = 'sett';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(optionText(active(el, input))).toBe('Settings');
        input.value = 'zzz';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    });

    it('opened by the `open` prop, typing filters: the query is not reset on every key', async () => {
        document.body.innerHTML = '<pdx-command></pdx-command>';
        await tick();
        const el = document.querySelector('pdx-command') as Cmd & { open: boolean };
        el.items = ITEMS;
        el.open = true;
        await tick(30);
        const input = el.querySelector('input') as HTMLInputElement;
        input.value = 'sett';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(input.value, 'the query was reset').toBe('sett');
        expect([...el.querySelectorAll('[role="option"]')].map(o => optionText(o))).toEqual(['Settings']);
    });

    it('Enter on the highlight runs it; a disabled command is shown, marked, and never runs', async () => {
        const { el, input } = await openPalette();
        const archive = [...el.querySelectorAll('[role="option"]')].find(o => optionText(o) === 'Archive Project')!;
        expect(archive, 'the disabled command was dropped from the list').toBeTruthy();
        expect(archive.getAttribute('aria-disabled')).toBe('true');
        const picked: string[] = [];
        el.addEventListener('pdx-select', (e) => picked.push((e as CustomEvent).detail.id));
        (archive as HTMLElement).click();
        await tick();
        expect(picked).toEqual([]);
        key(input, 'Enter');
        await tick();
        expect(picked).toEqual(['dash']);
    });
});

describe('the input is the only tab stop of the list', () => {
    it('no option is focusable', async () => {
        const { el } = await openPalette();
        const options = [...el.querySelectorAll<HTMLElement>('[role="option"]')];
        expect(options.length).toBe(5);
        expect(options.filter(o => o.tabIndex >= 0 || o.tagName === 'BUTTON').map(o => optionText(o))).toEqual([]);
    });
});

describe('groups, shortcuts, ids', () => {
    it('a group is a role="group" named by its heading', async () => {
        const { el } = await openPalette();
        const groups = [...el.querySelectorAll('[role="listbox"] > [role="group"]')];
        expect(groups).toHaveLength(2);
        const name = document.getElementById(groups[1].getAttribute('aria-labelledby')!)?.textContent?.trim();
        expect(name).toBe('Account');
        expect(groups[1].querySelectorAll('[role="option"]')).toHaveLength(1);
    });

    it('a shortcut is aria-keyshortcuts, and the visible keys are not part of the name', async () => {
        const { el } = await openPalette();
        const search = [...el.querySelectorAll('[role="option"]')].find(o => optionText(o) === 'Search Projects')!;
        expect(search.getAttribute('aria-keyshortcuts')).toBe('Control+P');
        expect(search.querySelector('.pdx-command-item-shortcut')!.getAttribute('aria-hidden')).toBe('true');
        const settings = [...el.querySelectorAll('[role="option"]')].find(o => optionText(o) === 'Settings')!;
        expect(settings.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+,');
    });

    it('the item slot draws the commands from the first open, not only after the query changes', async () => {
        // As a template builds it: items and the slot carrier set before the element connects.
        const el = document.createElement('pdx-command') as Cmd;
        el.items = ITEMS;
        el.appendChild(slotCarrier('item', (scope) => html`<em class="custom">${(scope.item as { label: string }).label}!</em>`));
        document.body.appendChild(el);
        await tick();
        el.show();
        await tick(30);
        expect([...el.querySelectorAll('[role="option"] .custom')].map(n => n.textContent)).toContain('Settings!');
    });

    it('two palettes on a page do not share the listbox id', async () => {
        document.body.innerHTML = '<pdx-command></pdx-command><pdx-command></pdx-command>';
        await tick(30);
        const ids = [...document.querySelectorAll('[role="listbox"]')].map(l => l.id);
        expect(ids[0]).not.toBe(ids[1]);
        const input = document.querySelector('pdx-command input')!;
        document.querySelector<Cmd>('pdx-command')!.show();
        await tick(30);
        expect(input.getAttribute('aria-controls')).toBe(ids[0]);
    });
});
